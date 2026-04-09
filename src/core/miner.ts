import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import ignore from 'ignore';
import { VectorStorage } from '../storage/vector';
import { FOLDER_ROOM_MAP } from './room_detector_constants';
import * as readline from 'readline';

export interface MinerConfig {
  wing: string;
  rooms?: { name: string, keywords: string[] }[];
}

export const READABLE_EXTENSIONS = new Set([
  ".txt", ".md", ".py", ".js", ".ts", ".jsx", ".tsx", ".json", ".yaml", ".yml",
  ".html", ".css", ".java", ".go", ".rs", ".rb", ".sh", ".csv", ".sql", ".toml"
]);

export const SKIP_DIRS = new Set([
  ".git", "node_modules", "__pycache__", ".venv", "venv", "env", "dist", "build",
  ".next", "coverage", ".mempalace", "target"
]);

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const MIN_CHUNK_SIZE = 50;

export function chunkText(content: string): { content: string, chunkIndex: number }[] {
  content = content.trim();
  if (!content) return [];

  const chunks = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < content.length) {
    let end = Math.min(start + CHUNK_SIZE, content.length);

    if (end < content.length) {
      const newlinePos = content.lastIndexOf("\n\n", end);
      if (newlinePos > start + CHUNK_SIZE / 2) {
        end = newlinePos;
      } else {
        const singleNewline = content.lastIndexOf("\n", end);
        if (singleNewline > start + CHUNK_SIZE / 2) {
          end = singleNewline;
        }
      }
    }

    const chunk = content.substring(start, end).trim();
    if (chunk.length >= MIN_CHUNK_SIZE) {
      chunks.push({ content: chunk, chunkIndex });
      chunkIndex++;
    }

    start = end < content.length ? end - CHUNK_OVERLAP : end;
  }

  return chunks;
}

export function detectRoom(filepath: string, content: string, rooms: { name: string, keywords: string[] }[] = [], projectPath: string): string {
  const relative = path.relative(projectPath, filepath).toLowerCase();
  const filename = path.parse(filepath).name.toLowerCase();
  const contentLower = content.substring(0, 2000).toLowerCase();

  const parts = relative.split(path.sep);
  for (const part of parts.slice(0, -1)) {
    if (FOLDER_ROOM_MAP[part]) return FOLDER_ROOM_MAP[part];
  }

  for (const [key, room] of Object.entries(FOLDER_ROOM_MAP)) {
    if (filename.includes(key)) return room;
  }

  if (rooms.length > 0) {
    for (const room of rooms) {
      const candidates = [room.name.toLowerCase(), ...room.keywords.map(k => k.toLowerCase())];
      if (candidates.some(c => filename.includes(c))) {
        return room.name;
      }
    }
  }

  const scores: Record<string, number> = {};
  for (const room of rooms) {
    const candidates = [room.name.toLowerCase(), ...room.keywords.map(k => k.toLowerCase())];
    for (const c of candidates) {
      if (contentLower.includes(c)) {
        scores[room.name] = (scores[room.name] || 0) + 1;
      }
    }
  }

  for (const [key, room] of Object.entries(FOLDER_ROOM_MAP)) {
    if (contentLower.includes(key)) {
      scores[room] = (scores[room] || 0) + 1;
    }
  }

  const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sortedScores.length > 0 && sortedScores[0][1] > 0) return sortedScores[0][0];

  return "general";
}

export function scanProject(dir: string, respectGitignore: boolean = true): string[] {
  const projectPath = path.resolve(dir);
  const files: string[] = [];
  const ig = ignore();
  if (respectGitignore && fs.existsSync(path.join(projectPath, '.gitignore'))) {
      ig.add(fs.readFileSync(path.join(projectPath, '.gitignore'), 'utf-8'));
  }

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(projectPath, fullPath);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (respectGitignore && ig.ignores(relativePath + '/')) continue;
        walk(fullPath);
      } else {
        if (READABLE_EXTENSIONS.has(path.extname(entry.name))) {
          if (respectGitignore && ig.ignores(relativePath)) continue;
          files.push(fullPath);
        }
      }
    }
  }
  walk(projectPath);
  return files;
}

export async function mineDirectory(
  dir: string, 
  storage: VectorStorage, 
  config: MinerConfig,
  agent: string = 'mempalace'
): Promise<{ filed: number, skipped: number }> {
  const projectPath = path.resolve(dir);
  const files = scanProject(dir);
  const startTime = Date.now();
  let totalDrawersCount = 0;
  let skippedCount = 0;
  const BATCH_SIZE = 50;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🚀 Starting Mine | Wing: ${config.wing}`);
  console.log(`${'─'.repeat(50)}`);

  process.stdout.write(`📡 Loading cache...`);
  const mtimeMap = await storage.getMtimeMap(config.wing);
  process.stdout.write(` Done. (${mtimeMap.size} files in cache)\n`);

  const CONCURRENCY = 20;
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
    let localBatch: any[] = [];
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
          const content = await fs.promises.readFile(file, 'utf-8');
          const room = detectRoom(file, content, config.rooms || [], projectPath);
          const chunks = chunkText(content);
          for (const chunk of chunks) {
            localBatch.push({
              id: `drawer_${config.wing}_${room}_${crypto.createHash('md5').update(file + chunk.chunkIndex).digest('hex').substring(0, 16)}`,
              content: chunk.content,
              wing: config.wing,
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
