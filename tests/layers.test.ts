import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorStorage } from '../src/storage/vector';
import { Layer0, Layer1, MemoryStack } from '../src/core/layers';
import { MempalaceConfig } from '../src/core/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Memory Layers', () => {
  const testDir = path.join(os.tmpdir(), `mempalace_layers_test_${Math.random().toString(36).substring(7)}`);
  const identityPath = path.join(testDir, 'identity.txt');
  const dbPath = path.join(testDir, 'lancedb');
  let storage: VectorStorage;
  let config: MempalaceConfig;

  beforeEach(async () => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(identityPath, 'I am a test AI.');
    
    // Create a config file in the test dir
    const configPath = path.join(testDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      palace_path: testDir,
      collection_name: 'layers_test'
    }));

    config = new MempalaceConfig(testDir);
    
    storage = new VectorStorage(dbPath, 'layers_test');
    await storage.init();
  });

  afterEach(async () => {
    await storage.close();
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('Layer0 should render identity from file', () => {
    const l0 = new Layer0(identityPath);
    expect(l0.render()).toBe('I am a test AI.');
  });

  it('Layer0 should show default identity when file is missing', () => {
    const l0 = new Layer0(path.join(testDir, 'missing.txt'));
    expect(l0.render()).toContain('No identity configured');
  });

  it('Layer1 should generate essential story', async () => {
    await storage.upsertDrawers([{
      id: 'd1',
      content: 'Important memory about architecture',
      wing: 'test',
      room: 'arch',
      importance: 5,
      sourceFile: 'arch.txt',
      addedBy: 'test',
      filedAt: new Date().toISOString(),
      vector: new Array(384).fill(0)
    }]);

    const l1 = new Layer1(storage);
    const story = await l1.generate();
    expect(story).toContain('ESSENTIAL STORY');
    expect(story).toContain('[arch]');
    expect(story).toContain('Important memory');
  });

  it('MemoryStack should coordinate wakeUp', async () => {
    const stack = new MemoryStack(config, storage);
    // Use the identity path we created
    (stack as any).l0 = new Layer0(identityPath);
    
    const wakeup = await stack.wakeUp();
    expect(wakeup).toContain('I am a test AI.');
    expect(wakeup).toContain('L1');
  });

  it('MemoryStack should handle recall', async () => {
    await storage.upsertDrawers([{
      id: 'd2',
      content: 'Recall this specific content',
      wing: 'project',
      room: 'tasks',
      sourceFile: 'tasks.txt',
      addedBy: 'test',
      filedAt: new Date().toISOString(),
      vector: new Array(384).fill(0)
    }]);

    const stack = new MemoryStack(config, storage);
    const recall = await stack.recall('project', 'tasks');
    expect(recall).toContain('Recall this specific content');
  });

  it('MemoryStack should handle search', async () => {
    await storage.upsertDrawers([{
      id: 'd3',
      content: 'Searchable content for the palace',
      wing: 'project',
      room: 'data',
      sourceFile: 'data.txt',
      addedBy: 'test',
      filedAt: new Date().toISOString(),
      vector: new Array(384).fill(0)
    }]);

    const stack = new MemoryStack(config, storage);
    const results = await stack.search('palace');
    expect(results).toContain('SEARCH RESULTS');
    expect(results).toContain('Searchable content');
  });
});
