import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { VectorStorage } from '../storage/vector';
import { normalizeContent } from './normalize';
import { spellcheckTranscript } from './spellcheck';
import { Drawer } from './types';
import * as readline from 'readline';

export const CONVO_EXTENSIONS = new Set(['.txt', '.md', '.json', '.jsonl']);
const MIN_CHUNK_SIZE = 30;

export const TOPIC_KEYWORDS: Record<string, string[]> = {
  "technical": ["code", "python", "function", "bug", "error", "api", "database", "server", "deploy", "git", "test", "debug", "refactor"],
  "architecture": ["architecture", "design", "pattern", "structure", "schema", "interface", "module", "component", "service", "layer"],
  "planning": ["plan", "roadmap", "milestone", "deadline", "priority", "sprint", "backlog", "scope", "requirement", "spec"],
  "decisions": ["decided", "chose", "picked", "switched", "migrated", "replaced", "trade-off", "alternative", "option", "approach"],
  "problems": ["problem", "issue", "broken", "failed", "crash", "stuck", "workaround", "fix", "solved", "resolved"]
};

export function detectConvoRoom(content: string): string {
  const contentLower = content.substring(0, 3000).toLowerCase();
  const scores: Record<string, number> = {};
  for (const [room, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) if (contentLower.includes(kw)) score++;
    if (score > 0) scores[room] = score;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : 'general';
}

export function chunkExchanges(content: string): { content: string, chunkIndex: number }[] {
  const lines = content.split('\n');
  const quoteLines = lines.filter(l => l.trim().startsWith('>')).length;
  if (quoteLines >= 3) return chunkByExchange(lines);
  return chunkByParagraph(content);
}

function chunkByExchange(lines: string[]): { content: string, chunkIndex: number }[] {
  const chunks: { content: string, chunkIndex: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('>')) {
      const userTurn = line.trim();
      i++;
      const aiLines: string[] = [];
      while (i < lines.length) {
        const nextLine = lines[i];
        if (nextLine.trim().startsWith('>') || nextLine.trim().startsWith('---')) break;
        if (nextLine.trim()) aiLines.push(nextLine.trim());
        i++;
      }
      const aiResponse = aiLines.slice(0, 8).join(' ');
      const combined = aiResponse ? `${userTurn}\n${aiResponse}` : userTurn;
      if (combined.trim().length > MIN_CHUNK_SIZE) {
        chunks.push({ content: combined, chunkIndex: chunks.length });
      }
    } else i++;
  }
  return chunks;
}

function chunkByParagraph(content: string): { content: string, chunkIndex: number }[] {
  const chunks: { content: string, chunkIndex: number }[] = [];
  const paragraphs = content.split('\n\n').map(p => p.trim()).filter(p => p);
  if (paragraphs.length <= 1 && content.split('\n').length > 20) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 25) {
      const group = lines.slice(i, i + 25).join('\n').trim();
      if (group.length > MIN_CHUNK_SIZE) chunks.push({ content: group, chunkIndex: chunks.length });
    }
    return chunks;
  }
  for (const para of paragraphs) {
    if (para.length > MIN_CHUNK_SIZE) chunks.push({ content: para, chunkIndex: chunks.length });
  }
  return chunks;
}

export async function mineConversations(
  dir: string,
  storage: VectorStorage,
  wing: string,
  agent: string = 'mempalace'
): Promise<{ filed: number, skipped: number }> {
  const files: string[] = [];
  const walk = (currentDir: string) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (['.git', 'node_modules', '.mempalace'].includes(entry.name)) continue;
        walk(fullPath);
      } else if (CONVO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  };
  walk(dir);
  const startTime = Date.now();
  let totalDrawersCount = 0;
  let skippedCount = 0;
  const BATCH_SIZE = 50;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`💬 Starting Conversation Mine | Wing: ${wing}`);
  console.log(`${'─'.repeat(50)}`);

  process.stdout.write(`📡 Loading cache...`);
  const mtimeMap = await storage.getMtimeMap(wing);
  process.stdout.write(` Done. (${mtimeMap.size} files in cache)\n`);

  const CONCURRENCY = 10;
  const queue = [...files];
  let processedCount = 0;
  let lastLogTime = 0;

  const updateProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastLogTime < 200) return;
    lastLogTime = now;
    const elapsed = (now - startTime) / 1000;
    const rate = (processedCount / elapsed).toFixed(1);
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`📦 Progress: ${processedCount}/${files.length} | ${rate} files/s | Skip: ${skippedCount} | Drawers: ${totalDrawersCount}`);
  };

  async function processQueue() {
    let localBatch: Drawer[] = [];
    while (queue.length > 0) {
      const file = queue.shift();
      if (!file) break;
      try {
        const stats = await fs.promises.stat(file);
        const mtime = stats.mtimeMs;
        const storedMtime = mtimeMap.get(file);
        if (storedMtime !== undefined && Math.abs(storedMtime - mtime) < 1) {
          skippedCount++;
        } else {
          const rawContent = await fs.promises.readFile(file, 'utf-8');
          let content = normalizeContent(rawContent, path.extname(file));
          if (content && content.length >= MIN_CHUNK_SIZE) {
            content = spellcheckTranscript(content);
            const chunks = chunkExchanges(content);
            const room = detectConvoRoom(content);
            for (const chunk of chunks) {
              localBatch.push({
                id: `drawer_${wing}_${room}_${crypto.createHash('md5').update(file + chunk.chunkIndex).digest('hex').substring(0, 16)}`,
                content: chunk.content,
                wing,
                room,
                sourceFile: file,
                sourceMtime: mtime,
                chunkIndex: chunk.chunkIndex,
                addedBy: agent,
                filedAt: new Date().toISOString()
              });
              if (localBatch.length >= BATCH_SIZE) {
                const toUpsert = [...localBatch];
                localBatch = [];
                await storage.upsertDrawers(toUpsert);
                totalDrawersCount += toUpsert.length;
              }
            }
          }
        }
      } catch (e: any) {
        process.stdout.write(`\n❌ Error processing ${file}: ${e.message}\n`);
      }
      processedCount++;
      updateProgress();
    }
    if (localBatch.length > 0) {
      await storage.upsertDrawers(localBatch);
      totalDrawersCount += localBatch.length;
      updateProgress(true);
    }
  }

  const workers = Array(Math.min(CONCURRENCY, files.length)).fill(null).map(() => processQueue());
  await Promise.all(workers);

  const finalElapsed = (Date.now() - startTime) / 1000;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ Done!`);
  console.log(`⏱️  Time: ${finalElapsed.toFixed(2)}s`);
  console.log(`📂 Files: ${files.length} (${skippedCount} skipped)`);
  console.log(`🗄️  Drawers: ${totalDrawersCount}`);
  console.log(`${'─'.repeat(50)}\n`);
  return { filed: totalDrawersCount, skipped: skippedCount };
}
