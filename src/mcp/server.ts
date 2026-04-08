import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VectorStorage } from "../storage/vector";
import { KnowledgeGraph } from "../storage/sqlite";
import { MempalaceConfig } from "../core/config";
import { traverseGraph, findTunnels, graphStats } from "../storage/palace_graph";
import * as path from 'path';
import pkg from '../../package.json';

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

const AAAK_SPEC = `AAAK is a compressed memory dialect that MemPalace uses for efficient storage.
It is designed to be readable by both humans and LLMs without decoding.

FORMAT:
  ENTITIES: 3-letter uppercase codes. ALC=Alice, JOR=Jordan, RIL=Riley, MAX=Max, BEN=Ben.
  EMOTIONS: *action markers* before/during text. *warm*=joy, *fierce*=determined, *raw*=vulnerable, *bloom*=tenderness.
  STRUCTURE: Pipe-separated fields. FAM: family | PROJ: projects | ⚠: warnings/reminders.
  DATES: ISO format (2026-03-31). COUNTS: Nx = N mentions (e.g., 570x).
  IMPORTANCE: ★ to ★★★★★ (1-5 scale).
  HALLS: hall_facts, hall_events, hall_discoveries, hall_preferences, hall_advice.
  WINGS: wing_user, wing_agent, wing_team, wing_code, wing_myproject, wing_hardware, wing_ue5, wing_ai_research.
  ROOMS: Hyphenated slugs representing named ideas (e.g., chromadb-setup, gpu-pricing).

EXAMPLE:
  FAM: ALC→♡JOR | 2D(kids): RIL(18,sports) MAX(11,chess+swimming) | BEN(contributor)

Read AAAK naturally — expand codes mentally, treat *markers* as emotional context.
When WRITING AAAK: use entity codes, mark emotions, keep structure tight.`;

// --- READ TOOLS ---

server.tool("mempalace_status", {}, async () => {
  const tax = await storage.getTaxonomy();
  return {
    content: [{ type: "text", text: JSON.stringify({ total_drawers: tax.total, palace_path: config.palacePath }) }]
  };
});

server.tool("mempalace_list_wings", {}, async () => {
  const tax = await storage.getTaxonomy();
  return {
    content: [{ type: "text", text: JSON.stringify({ wings: tax.wings }) }]
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
    content: [{ type: "text", text: JSON.stringify(counts) }]
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
    content: [{ type: "text", text: JSON.stringify(tax) }]
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
    content: [{ type: "text", text: JSON.stringify(results) }]
  };
});

server.tool("mempalace_check_duplicate", {
  content: z.string(),
  threshold: z.number().optional()
}, async ({ content, threshold }) => {
  const dup = await checkDuplicate(content, threshold);
  return {
    content: [{ type: "text", text: JSON.stringify(dup) }]
  };
});

server.tool("mempalace_get_aaak_spec", {}, async () => {
  return {
    content: [{ type: "text", text: JSON.stringify({ aaak_spec: AAAK_SPEC }) }]
  };
});

// --- GRAPH TOOLS ---

server.tool("mempalace_traverse_graph", {
  start_room: z.string(),
  max_hops: z.number().optional()
}, async ({ start_room, max_hops }) => {
  const res = await traverseGraph(storage, start_room, max_hops || 2);
  return {
    content: [{ type: "text", text: JSON.stringify(res) }]
  };
});

server.tool("mempalace_find_tunnels", {
  wing_a: z.string().optional(),
  wing_b: z.string().optional()
}, async ({ wing_a, wing_b }) => {
  const res = await findTunnels(storage, wing_a, wing_b);
  return {
    content: [{ type: "text", text: JSON.stringify(res) }]
  };
});

server.tool("mempalace_graph_stats", {}, async () => {
  const res = await graphStats(storage);
  return {
    content: [{ type: "text", text: JSON.stringify(res) }]
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
      content: [{ type: "text", text: JSON.stringify({ status: "skipped", message: "Duplicate content", existingId: dup.id }) }]
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
    content: [{ type: "text", text: JSON.stringify({ status: "added", id }) }]
  };
});

server.tool("mempalace_delete_drawer", {
  id: z.string()
}, async ({ id }) => {
  await storage.deleteDrawer(id);
  return {
    content: [{ type: "text", text: JSON.stringify({ status: "deleted", id }) }]
  };
});

// --- KNOWLEDGE GRAPH TOOLS ---

server.tool("mempalace_kg_query", {
  entity: z.string(),
  direction: z.enum(["incoming", "outgoing", "both"]).optional()
}, async ({ entity, direction }) => {
  const res = await kg.queryEntity(entity, undefined, direction || 'both');
  return {
    content: [{ type: "text", text: JSON.stringify(res) }]
  };
});

server.tool("mempalace_kg_add", {
  subject: z.string(),
  predicate: z.string(),
  object: z.string()
}, async ({ subject, predicate, object }) => {
  const id = kg.addTriple({ subject, predicate, object });
  return {
    content: [{ type: "text", text: JSON.stringify({ status: "added", id }) }]
  };
});

server.tool("mempalace_kg_invalidate", {
  subject: z.string(),
  predicate: z.string(),
  object: z.string()
}, async ({ subject, predicate, object }) => {
  kg.invalidate(subject, predicate, object);
  return {
    content: [{ type: "text", text: JSON.stringify({ status: "invalidated" }) }]
  };
});

server.tool("mempalace_kg_timeline", {
  entity: z.string().optional()
}, async ({ entity }) => {
  const res = kg.timeline(entity);
  return {
    content: [{ type: "text", text: JSON.stringify(res) }]
  };
});

server.tool("mempalace_kg_stats", {}, async () => {
  const res = kg.stats();
  return {
    content: [{ type: "text", text: JSON.stringify(res) }]
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
    content: [{ type: "text", text: JSON.stringify({ status: "written", id }) }]
  };
});

server.tool("mempalace_diary_read", {
  agent_name: z.string(),
  limit: z.number().optional()
}, async ({ agent_name, limit }) => {
  const wing = `agent_${agent_name.toLowerCase()}`;
  const results = await storage.listDrawers(limit || 10, { wing, room: 'diary' });
  return {
    content: [{ type: "text", text: JSON.stringify(results) }]
  };
});

export async function runMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MemPalace MCP server running on stdio");
}
