import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import ignore from 'ignore';
import { VectorStorage } from '../storage/vector';

export interface MinerConfig {
  wing: string;
  rooms: { name: string, keywords: string[] }[];
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

export function detectRoom(filepath: string, content: string, rooms: { name: string, keywords: string[] }[], projectPath: string): string {
  const relative = path.relative(projectPath, filepath).toLowerCase();
  const filename = path.parse(filepath).name.toLowerCase();
  const contentLower = content.substring(0, 2000).toLowerCase();

  // Folder priority
  const parts = relative.split(path.sep);
  for (const part of parts.slice(0, -1)) {
    for (const room of rooms) {
      const candidates = [room.name.toLowerCase(), ...room.keywords.map(k => k.toLowerCase())];
      if (candidates.some(c => part === c || part.includes(c) || c.includes(part))) {
        return room.name;
      }
    }
  }

  // Filename priority
  for (const room of rooms) {
    if (filename.includes(room.name.toLowerCase()) || room.name.toLowerCase().includes(filename)) {
      return room.name;
    }
  }

  // Content priority
  const scores: Record<string, number> = {};
  for (const room of rooms) {
    const keywords = [...room.keywords, room.name];
    let score = 0;
    for (const kw of keywords) {
      try {
          const regex = new RegExp(kw.toLowerCase(), 'g');
          const matches = contentLower.match(regex);
          if (matches) score += matches.length;
      } catch (e) {
          // ignore invalid regex from keywords
          if (contentLower.includes(kw.toLowerCase())) score++;
      }
    }
    scores[room.name] = score;
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
) {
  const projectPath = path.resolve(dir);
  const files = scanProject(dir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const room = detectRoom(file, content, config.rooms, projectPath);
    const chunks = chunkText(content);

    for (const chunk of chunks) {
      const id = `drawer_${config.wing}_${room}_${crypto.createHash('md5').update(file + chunk.chunkIndex).digest('hex').substring(0, 16)}`;
      await storage.upsertDrawer({
        id,
        content: chunk.content,
        wing: config.wing,
        room,
        sourceFile: file,
        chunkIndex: chunk.chunkIndex,
        addedBy: agent,
        filedAt: new Date().toISOString()
      });
    }
  }
}
