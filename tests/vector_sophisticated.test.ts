import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorStorage } from '../src/storage/vector';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('VectorStorage Sophisticated', () => {
  const dbDir = path.join(os.tmpdir(), '.test_lancedb_sophisticated');
  let storage: VectorStorage;

  async function seedStorage(s: VectorStorage) {
    const data = [
      { id: '1', content: 'JWT authentication', wing: 'project', room: 'backend' },
      { id: '2', content: 'React component library', wing: 'project', room: 'frontend' },
      { id: '3', content: 'Sprint planning notes', wing: 'notes', room: 'planning' },
      { id: '4', content: 'Database migration scripts', wing: 'project', room: 'backend' }
    ];
    for (const item of data) {
      await s.upsertDrawer({
        ...item,
        sourceFile: 'test.txt',
        chunkIndex: 0,
        addedBy: 'test',
        filedAt: '2026-01-01'
      });
    }
  }

  beforeEach(async () => {
    if (fs.existsSync(dbDir)) fs.rmSync(dbDir, { recursive: true, force: true });
    storage = new VectorStorage(dbDir, 'test_drawers');
    await storage.init();
  });

  afterEach(() => {
    if (fs.existsSync(dbDir)) fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it('should search with wing filter', async () => {
    await seedStorage(storage);
    const results = await storage.search('planning', 5, { wing: 'notes' });
    expect(results.every(r => r.wing === 'notes')).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should search with room filter', async () => {
    await seedStorage(storage);
    const results = await storage.search('database', 5, { room: 'backend' });
    expect(results.every(r => r.room === 'backend')).toBe(true);
  });

  it('should respect limit', async () => {
    await seedStorage(storage);
    const results = await storage.search('a', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should return all required fields', async () => {
    await seedStorage(storage);
    const results = await storage.search('authentication', 1);
    const hit = results[0];
    expect(hit).toHaveProperty('content');
    expect(hit).toHaveProperty('wing');
    expect(hit).toHaveProperty('room');
    expect(hit).toHaveProperty('similarity');
    expect(typeof hit.similarity).toBe('number');
  });
});
