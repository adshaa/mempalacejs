import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorStorage } from '../src/storage/vector';
import { buildGraph, traverseGraph, findTunnels, graphStats } from '../src/storage/palace_graph';
import * as fs from 'fs';
import * as path from 'path';

describe('palace_graph', () => {
  const testDir = path.join(__dirname, 'test_graph_data');
  const dbPath = path.join(testDir, 'lancedb');
  let storage: VectorStorage;

  beforeEach(async () => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    storage = new VectorStorage(dbPath, 'test_graph_drawers');
    await storage.init();

    // Seed some data for graph testing
    await storage.upsertDrawers([
      {
        id: 'd1',
        content: 'Auth logic in project A',
        wing: 'projectA',
        room: 'auth',
        hall: 'backend',
        date: '2025-01-01',
        addedBy: 'test',
        filedAt: new Date().toISOString(),
        vector: new Array(384).fill(0)
      },
      {
        id: 'd2',
        content: 'Auth logic in project B',
        wing: 'projectB',
        room: 'auth',
        hall: 'backend',
        date: '2025-01-02',
        addedBy: 'test',
        filedAt: new Date().toISOString(),
        vector: new Array(384).fill(0)
      },
      {
        id: 'd3',
        content: 'Database logic in project A',
        wing: 'projectA',
        room: 'db',
        hall: 'backend',
        date: '2025-01-03',
        addedBy: 'test',
        filedAt: new Date().toISOString(),
        vector: new Array(384).fill(0)
      }
    ]);
  });

  afterEach(async () => {
    await storage.close();
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should build a graph with nodes and edges', async () => {
    const graph = await buildGraph(storage);
    expect(graph.nodes).toBeDefined();
    expect(graph.nodes['auth']).toBeDefined();
    expect(graph.nodes['auth'].wings).toContain('projectA');
    expect(graph.nodes['auth'].wings).toContain('projectB');
    
    // Should have an edge between projectA and projectB via 'auth' room
    expect(graph.edges.length).toBeGreaterThan(0);
    const authEdge = graph.edges.find(e => e.room === 'auth');
    expect(authEdge).toBeDefined();
    expect(authEdge?.wing_a).toBe('projectA');
    expect(authEdge?.wing_b).toBe('projectB');
  });

  it('should traverse the graph', async () => {
    const results = await traverseGraph(storage, 'auth');
    expect(Array.isArray(results)).toBe(true);
    if (!Array.isArray(results)) return;
    expect(results[0].room).toBe('auth');
    // Since projectA is in both 'auth' and 'db', they should be connected
    expect(results.some(r => r.room === 'db')).toBe(true);
  });

  it('should find tunnels between wings', async () => {
    const tunnels = await findTunnels(storage, 'projectA', 'projectB');
    expect(tunnels.length).toBeGreaterThan(0);
    expect(tunnels[0].room).toBe('auth');
  });

  it('should return graph stats', async () => {
    const stats = await graphStats(storage);
    expect(stats.total_rooms).toBe(2); // auth and db
    expect(stats.tunnel_rooms).toBe(1); // only auth has 2+ wings
  });

  it('should handle non-existent start room in traverseGraph', async () => {
    const result = await traverseGraph(storage, 'non-existent');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('suggestions');
  });
});
