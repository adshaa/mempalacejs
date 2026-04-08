import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { VectorStorage } from '../storage/vector';
import { normalizeContent } from './normalize';
import { spellcheckTranscript } from './spellcheck';
import { Drawer } from './types';

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
    for (const kw of keywords) {
      if (contentLower.includes(kw)) score++;
    }
    if (score > 0) scores[room] = score;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : 'general';
}

export function chunkExchanges(content: string): { content: string, chunkIndex: number }[] {
  const lines = content.split('\n');
  const quoteLines = lines.filter(l => l.trim().startsWith('>')).length;

  if (quoteLines >= 3) {
    return chunkByExchange(lines);
  } else {
    return chunkByParagraph(content);
  }
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
        if (nextLine.trim().startsWith('>') || nextLine.trim().startsWith('---')) {
          break;
        }
        if (nextLine.trim()) {
          aiLines.push(nextLine.trim());
        }
        i++;
      }

      // Take first 8 lines of AI response for context
      const aiResponse = aiLines.slice(0, 8).join(' ');
      const combined = aiResponse ? `${userTurn}\n${aiResponse}` : userTurn;

      if (combined.trim().length > MIN_CHUNK_SIZE) {
        chunks.push({
          content: combined,
          chunkIndex: chunks.length
        });
      }
    } else {
      i++;
    }
  }

  return chunks;
}

function chunkByParagraph(content: string): { content: string, chunkIndex: number }[] {
  const chunks: { content: string, chunkIndex: number }[] = [];
  const paragraphs = content.split('\n\n').map(p => p.trim()).filter(p => p);

  if (paragraphs.length <= 1 && content.split('\n').length > 20) {
    // Fallback: chunk by line groups if no paragraphs
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 25) {
      const group = lines.slice(i, i + 25).join('\n').trim();
      if (group.length > MIN_CHUNK_SIZE) {
        chunks.push({ content: group, chunkIndex: chunks.length });
      }
    }
    return chunks;
  }

  for (const para of paragraphs) {
    if (para.length > MIN_CHUNK_SIZE) {
      chunks.push({ content: para, chunkIndex: chunks.length });
    }
  }

  return chunks;
}

export async function mineConversations(
  dir: string,
  storage: VectorStorage,
  wing: string,
  agent: string = 'mempalace'
) {
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

  console.log(`\nMining ${files.length} conversation files into wing: ${wing}`);

  let totalDrawersCount = 0;
  const BATCH_SIZE = 20;
  let batch: Drawer[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const rawContent = fs.readFileSync(file, 'utf-8');
      let content = normalizeContent(rawContent, path.extname(file));
      
      if (!content || content.length < MIN_CHUNK_SIZE) continue;

      // Apply technical spellcheck armor to transcript
      content = spellcheckTranscript(content);

      const chunks = chunkExchanges(content);
      const room = detectConvoRoom(content);

      for (const chunk of chunks) {
        const id = `drawer_${wing}_${room}_${crypto.createHash('md5').update(file + chunk.chunkIndex).digest('hex').substring(0, 16)}`;
        batch.push({
          id,
          content: chunk.content,
          wing,
          room,
          sourceFile: file,
          chunkIndex: chunk.chunkIndex,
          addedBy: agent,
          filedAt: new Date().toISOString()
        });

        if (batch.length >= BATCH_SIZE) {
          await storage.upsertDrawers(batch);
          totalDrawersCount += batch.length;
          batch = [];
        }
      }

      if ((i + 1) % 5 === 0 || i === files.length - 1) {
          process.stdout.write(`\rProcessed ${i + 1}/${files.length} files...`);
      }
    } catch (e: any) {
      console.error(`\nError processing ${file}: ${e.message}`);
    }
  }

  if (batch.length > 0) {
    await storage.upsertDrawers(batch);
    totalDrawersCount += batch.length;
  }

  console.log(`\nDone. Filed ${totalDrawersCount} drawers.`);
}
