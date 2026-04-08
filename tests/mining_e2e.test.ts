import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VectorStorage } from '../src/storage/vector';
import { mineDirectory } from '../src/core/miner';
import { mineConversations } from '../src/core/convo_miner';
import * as fs from 'fs';
import * as path from 'path';

describe('Mining E2E Pipeline', () => {
  const testDir = path.join(__dirname, 'test_mining_data');
  const dbPath = path.join(testDir, 'lancedb');
  const wingName = 'test_wing';
  let storage: VectorStorage;

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    
    // Create dummy project files
    const projectDir = path.join(testDir, 'project');
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir);
    fs.writeFileSync(path.join(projectDir, 'auth.ts'), 'export const login = () => { console.log("Login logic"); }');
    fs.writeFileSync(path.join(projectDir, 'README.md'), '# Test Project\nThis is a test project for MemPalace.');
    fs.writeFileSync(path.join(projectDir, '.gitignore'), 'node_modules\n*.log');
    
    // Create dummy convo files
    const convoDir = path.join(testDir, 'convos');
    if (!fs.existsSync(convoDir)) fs.mkdirSync(convoDir);
    fs.writeFileSync(path.join(convoDir, 'chat.md'), '> How do I login?\nYou use the login function in auth.ts.\n\n> What is this project?\nIt is a test for the memory palace.');

    storage = new VectorStorage(dbPath, 'test_drawers');
    await storage.init();
  });

  afterAll(async () => {
    await storage.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('Should mine project files correctly', async () => {
    const projectDir = path.join(testDir, 'project');
    await mineDirectory(projectDir, storage, { wing: wingName });
    
    const results = await storage.search('Login logic');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('Login logic');
    expect(results[0].room).toBe('backend'); 
  });

  it('Should mine conversation files correctly', async () => {
    const convoDir = path.join(testDir, 'convos');
    await mineConversations(convoDir, storage, wingName);
    
    const results = await storage.search('How do I login?');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('> How do I login?');
    expect(results[0].content).toContain('You use the login function');
  });

  it('Should show correct taxonomy/status', async () => {
    const taxonomy = await storage.getTaxonomy();
    expect(taxonomy.wings[wingName]).toBeGreaterThan(0);
  });
});
