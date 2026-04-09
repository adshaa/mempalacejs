import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mocking dependencies for MCP tests
// We need to point to a test directory
const testDir = path.join(os.tmpdir(), `mempalace_mcp_test_${Math.random().toString(36).substring(7)}`);

import { VectorStorage } from '../src/storage/vector';
import { KnowledgeGraph } from '../src/storage/sqlite';

describe('MCP Tools Logic', () => {
  let storage: VectorStorage;
  let kg: KnowledgeGraph;

  beforeEach(async () => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });
    
    storage = new VectorStorage(path.join(testDir, 'lancedb'), 'test_drawers');
    await storage.init();
    
    kg = new KnowledgeGraph(path.join(testDir, 'kg.sqlite3'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should handle mempalace_add_drawer and mempalace_status', async () => {
    const content = "Test memory for MCP parity.";
    const id = `drawer_test_room_${Date.now()}`;
    
    await storage.upsertDrawer({
      id,
      content,
      wing: 'test_wing',
      room: 'test_room',
      sourceFile: 'mcp',
      chunkIndex: 0,
      addedBy: 'mcp',
      filedAt: new Date().toISOString()
    });

    const tax = await storage.getTaxonomy();
    expect(tax.total).toBe(1);
    expect(tax.wings['test_wing']).toBe(1);
  });

  it('should handle mempalace_check_duplicate', async () => {
    const content = "The authentication module uses JWT tokens.";
    await storage.upsertDrawer({
      id: 'drawer_1',
      content,
      wing: 'w',
      room: 'r',
      sourceFile: 'f',
      chunkIndex: 0,
      addedBy: 'u',
      filedAt: 'd'
    });

    // Simple similarity check (our search logic)
    const results = await storage.search(content, 1);
    expect(results[0].similarity).toBeGreaterThan(0.9);
  });

  it('should handle KG tools (add/query)', async () => {
    kg.addTriple({ subject: "Alice", predicate: "knows", object: "Bob" });
    const results = kg.queryEntity("Alice");
    expect(results.length).toBe(1);
    expect(results[0].object).toBe("Bob");
  });

  it('should handle diary write and read', async () => {
    const agentName = "TestAgent";
    const wing = `agent_${agentName.toLowerCase()}`;
    
    await storage.upsertDrawer({
      id: 'diary_1',
      content: "I felt productive today.",
      wing,
      room: 'diary',
      sourceFile: 'diary',
      chunkIndex: 0,
      addedBy: agentName,
      filedAt: new Date().toISOString()
    });

    const results = await storage.search("", 10, { wing, room: 'diary' });
    expect(results.length).toBe(1);
    expect(results[0].content).toBe("I felt productive today.");
  });
});
