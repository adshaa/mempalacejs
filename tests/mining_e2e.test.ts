import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VectorStorage } from '../src/storage/vector';
import { mineDirectory } from '../src/core/miner';
import { mineConversations } from '../src/core/convo_miner';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Mining E2E Pipeline', () => {
  const testDir = path.join(os.tmpdir(), `mempalace_e2e_test_${Math.random().toString(36).substring(7)}`);
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
    const result = await mineDirectory(projectDir, storage, { wing: wingName });
    expect(result.filed).toBeGreaterThanOrEqual(1);
    
    // Check taxonomy
    const taxonomy = await storage.getTaxonomy();
    expect(taxonomy.wings[wingName]).toBeGreaterThan(0);

    // Search for content from auth.ts
    const results = await storage.search('Login logic');
    expect(results.length).toBeGreaterThan(0);
    const authDrawer = results.find(r => r.content.includes('Login logic'));
    expect(authDrawer).toBeDefined();
  });

  it('Should mine conversation files correctly', async () => {
    const convoDir = path.join(testDir, 'convos');
    const result = await mineConversations(convoDir, storage, wingName);
    expect(result.filed).toBeGreaterThanOrEqual(1);
    
    const results = await storage.search('How do I login?');
    expect(results.length).toBeGreaterThan(0);
    const convoDrawer = results.find(r => r.content.includes('How do I login?'));
    expect(convoDrawer).toBeDefined();
  });

  it('Should skip unchanged files on subsequent mine', async () => {
    const projectDir = path.join(testDir, 'project');
    // Third mine (first was in first test, second was in convo test? No, projectDir is different)
    const result = await mineDirectory(projectDir, storage, { wing: wingName });
    expect(result.filed).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('Should show correct taxonomy/status', async () => {
    const taxonomy = await storage.getTaxonomy();
    expect(taxonomy.wings[wingName]).toBeGreaterThan(0);
  });
});
