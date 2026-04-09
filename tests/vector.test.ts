import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorStorage } from '../src/storage/vector';
import * as fs from 'fs';
import * as path from 'path';

import * as os from 'os';

describe('VectorStorage', () => {
  const dbDir = path.join(os.tmpdir(), `.test_lancedb_${Math.random().toString(36).substring(7)}`);
  let storage: VectorStorage;

  beforeEach(async () => {
    if (fs.existsSync(dbDir)) {
      fs.rmSync(dbDir, { recursive: true, force: true });
    }
    storage = new VectorStorage(dbDir, 'test_drawers');
    await storage.init();
  });

  afterEach(() => {
    if (fs.existsSync(dbDir)) {
      fs.rmSync(dbDir, { recursive: true, force: true });
    }
  });

  it('should upsert and search drawers', async () => {
    await storage.upsertDrawer({
      id: 'drawer_1',
      content: 'We decided to use Node.js instead of Python.',
      wing: 'project',
      room: 'decisions',
      sourceFile: 'chat.txt',
      chunkIndex: 0,
      addedBy: 'test',
      filedAt: '2026-01-01T00:00:00Z'
    });

    const results = await storage.search('Why are we using Node.js?');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('Node.js');
    expect(results[0].similarity).toBeGreaterThan(0);
    
    // Testing taxonomy
    const tax = await storage.getTaxonomy();
    expect(tax.total).toBe(1);
    expect(tax.wings['project']).toBe(1);
    expect(tax.rooms['decisions']).toBe(1);
  });
});
