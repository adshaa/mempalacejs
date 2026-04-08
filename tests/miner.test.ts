import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanProject, detectRoom, chunkText } from '../src/core/miner';

describe('Miner', () => {
  const tmpDir = path.join(os.tmpdir(), 'mempalace_miner_test');

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relPath: string, content: string) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  it('should scan project and respect gitignore', () => {
    writeFile('.gitignore', 'ignored.py\ngenerated/');
    writeFile('src/app.py', 'print("hello")\n'.repeat(20));
    writeFile('ignored.py', 'print("ignore me")\n'.repeat(20));
    writeFile('generated/artifact.py', 'print("artifact")\n'.repeat(20));

    const files = scanProject(tmpDir);
    const relFiles = files.map(f => path.relative(tmpDir, f));
    expect(relFiles).toContain('src/app.py');
    expect(relFiles).not.toContain('ignored.py');
    expect(relFiles).not.toContain('generated/artifact.py');
  });

  it('should detect room based on folder path', () => {
    const rooms = [
      { name: 'backend', keywords: ['python', 'api'] },
      { name: 'frontend', keywords: ['react', 'css'] }
    ];
    const room = detectRoom(path.join(tmpDir, 'backend', 'app.py'), '', rooms, tmpDir);
    expect(room).toBe('backend');
  });

  it('should detect room based on keyword scoring', () => {
    const rooms = [
      { name: 'database', keywords: ['sql', 'postgres', 'query'] },
      { name: 'ui', keywords: ['button', 'style', 'div'] }
    ];
    const content = "We need to run a SQL query to update the database.";
    const room = detectRoom(path.join(tmpDir, 'generic.txt'), content, rooms, tmpDir);
    expect(room).toBe('database');
  });

  it('should chunk text correctly', () => {
    const content = "First paragraph.\n\nSecond paragraph.\n\n" + "a".repeat(1000);
    const chunks = chunkText(content);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content).toContain("First paragraph");
  });
});
