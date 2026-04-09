import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VectorStorage } from "../storage/vector";
import { KnowledgeGraph } from "../storage/sqlite";
import { MempalaceConfig } from "../core/config";
import { traverseGraph, findTunnels, graphStats } from "../storage/palace_graph";
import { MemoryStack } from "../core/layers";
import { AAAK_SPEC } from "../core/aaak_spec";
import * as path from 'path';
import pkg from '../../package.json';
import fastJson from 'fast-json-stringify';

const stringifyGeneric = fastJson({ type: 'object', additionalProperties: true });
const stringifyDrawers = fastJson({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      content: { type: 'string' },
      wing: { type: 'string' },
      room: { type: 'string' },
      similarity: { type: 'number' }
    },
    additionalProperties: true
  }
});

const config = new MempalaceConfig();
const dbPath = path.join(config.palacePath, 'lancedb');
const kgPath = path.join(config.palacePath, 'knowledge_graph.sqlite3');
const storage = new VectorStorage(dbPath, config.collectionName);
const kg = new KnowledgeGraph(kgPath);

const server = new McpServer({
  name: "mempalace",
  version: pkg.version
});

// Helper for exact duplicate checking
async function checkDuplicate(content: string, threshold: number = 0.9): Promise<{isDuplicate: boolean, similarity: number, id?: string}> {
  const results = await storage.search(content, 1);
  if (results.length > 0 && results[0].similarity >= threshold) {
    return { isDuplicate: true, similarity: results[0].similarity, id: results[0].id };
  }
  return { isDuplicate: false, similarity: results.length > 0 ? results[0].similarity : 0 };
}

// --- READ TOOLS ---

server.tool("mempalace_status", {}, async () => {
  const tax = await storage.getTaxonomy();
  return {
    content: [{ type: "text", text: stringifyGeneric({ total_drawers: tax.total, palace_path: config.palacePath }) }]
  };
});

server.tool("mempalace_list_wings", {}, async () => {
  const tax = await storage.getTaxonomy();
  return {
    content: [{ type: "text", text: stringifyGeneric({ wings: tax.wings }) }]
  };
});

server.tool("mempalace_list_rooms", { wing: z.string().optional() }, async ({ wing }) => {
  const allRows = await storage.getAllMetadata(['wing', 'room']);
  const counts: Record<string, number> = {};
  for (const row of allRows) {
    if (!wing || row.wing === wing) {
      counts[row.room as string] = (counts[row.room as string] || 0) + 1;
    }
  }
  return {
    content: [{ type: "text", text: stringifyGeneric(counts) }]
  };
});

server.tool("mempalace_get_taxonomy", {}, async () => {
  const allRows = await storage.getAllMetadata(['wing', 'room']);
  const tax: Record<string, Record<string, number>> = {};
  for (const row of allRows) {
    const w = row.wing as string;
    const r = row.room as string;
    if (!tax[w]) tax[w] = {};
    tax[w][r] = (tax[w][r] || 0) + 1;
  }
  return {
    content: [{ type: "text", text: stringifyGeneric(tax) }]
  };
});

server.tool("mempalace_search", {
  query: z.string(),
  limit: z.number().optional(),
  wing: z.string().optional(),
  room: z.string().optional()
}, async ({ query, limit, wing, room }) => {
  const results = await storage.search(query, limit || 5, { wing, room });
  return {
    content: [{ type: "text", text: stringifyDrawers(results) }]
  };
});

server.tool("mempalace_check_duplicate", {
  content: z.string(),
  threshold: z.number().optional()
}, async ({ content, threshold }) => {
  const dup = await checkDuplicate(content, threshold);
  return {
    content: [{ type: "text", text: stringifyGeneric(dup) }]
  };
});

server.tool("mempalace_get_aaak_spec", {}, async () => {
  return {
    content: [{ type: "text", text: stringifyGeneric({ aaak_spec: AAAK_SPEC }) }]
  };
});

server.tool("mempalace_wake_up", { wing: z.string().optional() }, async ({ wing }) => {
  const stack = new MemoryStack(config, storage);
  const text = await stack.wakeUp(wing);
  return {
    content: [{ type: "text", text }]
  };
});

server.tool("mempalace_recall", { 
  wing: z.string().optional(),
  room: z.string().optional(),
  limit: z.number().optional()
}, async ({ wing, room, limit }) => {
  const stack = new MemoryStack(config, storage);
  const text = await stack.recall(wing, room, limit || 10);
  return {
    content: [{ type: "text", text }]
  };
});

// --- GRAPH TOOLS ---

server.tool("mempalace_traverse_graph", {
  start_room: z.string(),
  max_hops: z.number().optional()
}, async ({ start_room, max_hops }) => {
  const res = await traverseGraph(storage, start_room, max_hops || 2);
  return {
    content: [{ type: "text", text: stringifyGeneric(res) }]
  };
});

server.tool("mempalace_find_tunnels", {
  wing_a: z.string().optional(),
  wing_b: z.string().optional()
}, async ({ wing_a, wing_b }) => {
  const res = await findTunnels(storage, wing_a, wing_b);
  return {
    content: [{ type: "text", text: stringifyGeneric(res) }]
  };
});

server.tool("mempalace_graph_stats", {}, async () => {
  const res = await graphStats(storage);
  return {
    content: [{ type: "text", text: stringifyGeneric(res) }]
  };
});

// --- WRITE TOOLS ---

server.tool("mempalace_add_drawer", {
  wing: z.string(),
  room: z.string(),
  content: z.string()
}, async (args) => {
  const dup = await checkDuplicate(args.content);
  if (dup.isDuplicate) {
    return {
      content: [{ type: "text", text: stringifyGeneric({ status: "skipped", message: "Duplicate content", existingId: dup.id }) }]
    };
  }

  const id = `drawer_${args.wing}_${args.room}_${Date.now()}`;
  await storage.upsertDrawer({
    id,
    content: args.content,
    wing: args.wing,
    room: args.room,
    sourceFile: 'mcp',
    chunkIndex: 0,
    addedBy: 'mcp',
    filedAt: new Date().toISOString()
  });
  return {
    content: [{ type: "text", text: stringifyGeneric({ status: "added", id }) }]
  };
});

server.tool("mempalace_delete_drawer", {
  id: z.string()
}, async ({ id }) => {
  await storage.deleteDrawer(id);
  return {
    content: [{ type: "text", text: stringifyGeneric({ status: "deleted", id }) }]
  };
});

// --- KNOWLEDGE GRAPH TOOLS ---

server.tool("mempalace_kg_query", {
  entity: z.string(),
  direction: z.enum(["incoming", "outgoing", "both"]).optional()
}, async ({ entity, direction }) => {
  const res = await kg.queryEntity(entity, undefined, direction || 'both');
  return {
    content: [{ type: "text", text: stringifyGeneric(res as any) }]
  };
});

server.tool("mempalace_kg_add", {
  subject: z.string(),
  predicate: z.string(),
  object: z.string()
}, async ({ subject, predicate, object }) => {
  const id = kg.addTriple({ subject, predicate, object });
  return {
    content: [{ type: "text", text: stringifyGeneric({ status: "added", id }) }]
  };
});

server.tool("mempalace_kg_invalidate", {
  subject: z.string(),
  predicate: z.string(),
  object: z.string()
}, async ({ subject, predicate, object }) => {
  kg.invalidate(subject, predicate, object);
  return {
    content: [{ type: "text", text: stringifyGeneric({ status: "invalidated" }) }]
  };
});

server.tool("mempalace_kg_timeline", {
  entity: z.string().optional(),
  limit: z.number().optional()
}, async ({ entity, limit }) => {
  const res = kg.timeline(entity, limit || 100);
  return {
    content: [{ type: "text", text: stringifyGeneric(res as any) }]
  };
});

server.tool("mempalace_kg_stats", {}, async () => {
  const res = kg.stats();
  return {
    content: [{ type: "text", text: stringifyGeneric(res) }]
  };
});

// --- DIARY TOOLS ---

server.tool("mempalace_diary_write", {
  agent_name: z.string(),
  entry: z.string(),
  topic: z.string().optional()
}, async ({ agent_name, entry, topic }) => {
  const wing = `agent_${agent_name.toLowerCase()}`;
  const id = `diary_${Date.now()}`;
  await storage.upsertDrawer({
    id,
    content: entry,
    wing,
    room: 'diary',
    topic: topic || 'general',
    sourceFile: 'diary',
    chunkIndex: 0,
    addedBy: agent_name,
    filedAt: new Date().toISOString()
  });
  return {
    content: [{ type: "text", text: stringifyGeneric({ status: "written", id }) }]
  };
});

server.tool("mempalace_diary_read", {
  agent_name: z.string(),
  limit: z.number().optional()
}, async ({ agent_name, limit }) => {
  const wing = `agent_${agent_name.toLowerCase()}`;
  const results = await storage.listDrawers(limit || 10, { wing, room: 'diary' });
  return {
    content: [{ type: "text", text: stringifyDrawers(results as any) }]
  };
});

export async function runMcpServer() {
  const transport = new StdioServerTransport();
  
  // Ensure config directory and defaults exist
  config.init();

  // Cleanup on exit
  const cleanup = async () => {
    await storage.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await server.connect(transport);
  
  // Log to stderr to avoid breaking JSON-RPC
  console.error("MemPalace MCP server running on stdio");
  console.error("Note: If this is your first run, the 90MB AI model will download on the first search/mine.");
  console.error("To avoid timeouts, run 'mempalace setup' in your terminal.");
}
