import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { VectorStorage } from "../storage/vector";
import { KnowledgeGraph } from "../storage/sqlite";
import { MempalaceConfig } from "../core/config";
import { traverseGraph, findTunnels, graphStats } from "../storage/palace_graph";
import * as path from 'path';

const config = new MempalaceConfig();
const dbPath = path.join(config.palacePath, 'lancedb');
const kgPath = path.join(config.palacePath, 'knowledge_graph.sqlite3');
const storage = new VectorStorage(dbPath, config.collectionName);
const kg = new KnowledgeGraph(kgPath);

const server = new Server(
  { name: "mempalace", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

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

const tools = [
  // --- READ TOOLS ---
  {
    name: "mempalace_status",
    description: "Overview of the palace including total drawers and path.",
    handler: async () => {
      const tax = await storage.getTaxonomy();
      return { total_drawers: tax.total, palace_path: config.palacePath };
    }
  },
  {
    name: "mempalace_list_wings",
    description: "List all wings and their drawer counts.",
    handler: async () => ({ wings: (await storage.getTaxonomy()).wings })
  },
  {
    name: "mempalace_list_rooms",
    description: "List rooms, optionally filtered by wing.",
    inputSchema: { type: "object", properties: { wing: { type: "string" } } },
    handler: async (args: any) => {
      const allRows = await storage.getAllMetadata(['wing', 'room']);
      const counts: Record<string, number> = {};
      for (const row of allRows) {
        if (!args.wing || row.wing === args.wing) {
          counts[row.room as string] = (counts[row.room as string] || 0) + 1;
        }
      }
      return counts;
    }
  },
  {
    name: "mempalace_get_taxonomy",
    description: "Full hierarchical taxonomy of wings and rooms.",
    handler: async () => {
      const allRows = await storage.getAllMetadata(['wing', 'room']);
      const tax: Record<string, Record<string, number>> = {};
      for (const row of allRows) {
        const w = row.wing as string;
        const r = row.room as string;
        if (!tax[w]) tax[w] = {};
        tax[w][r] = (tax[w][r] || 0) + 1;
      }
      return tax;
    }
  },
  {
    name: "mempalace_search",
    description: "Semantic search across the palace. Returns verbatim content.",
    inputSchema: { 
      type: "object", 
      properties: { 
        query: { type: "string" }, 
        limit: { type: "number" },
        wing: { type: "string" },
        room: { type: "string" }
      }, 
      required: ["query"] 
    },
    handler: async (args: any) => await storage.search(args.query, args.limit || 5, { wing: args.wing, room: args.room })
  },
  {
    name: "mempalace_check_duplicate",
    description: "Check if exact content already exists in the palace.",
    inputSchema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
    handler: async (args: any) => await checkDuplicate(args.content)
  },
  {
    name: "mempalace_get_aaak_spec",
    description: "Returns the AAAK dialect specification.",
    handler: async () => ({ spec: AAAK_SPEC })
  },

  // --- GRAPH TOOLS ---
  {
    name: "mempalace_traverse_graph",
    description: "Walk the palace graph from a room to find connected ideas across wings.",
    inputSchema: { type: "object", properties: { start_room: { type: "string" }, max_hops: { type: "number" } }, required: ["start_room"] },
    handler: async (args: any) => await traverseGraph(storage, args.start_room, args.max_hops || 2)
  },
  {
    name: "mempalace_find_tunnels",
    description: "Find rooms that bridge two wings (hallways connecting domains).",
    inputSchema: { type: "object", properties: { wing_a: { type: "string" }, wing_b: { type: "string" } } },
    handler: async (args: any) => await findTunnels(storage, args.wing_a, args.wing_b)
  },
  {
    name: "mempalace_graph_stats",
    description: "Overview of palace graph connectivity.",
    handler: async () => await graphStats(storage)
  },

  // --- WRITE TOOLS ---
  {
    name: "mempalace_add_drawer",
    description: "File verbatim content into a wing/room.",
    inputSchema: { 
      type: "object", 
      properties: { 
        wing: { type: "string" }, 
        room: { type: "string" }, 
        content: { type: "string" } 
      }, 
      required: ["wing", "room", "content"] 
    },
    handler: async (args: any) => {
      const dup = await checkDuplicate(args.content);
      if (dup.isDuplicate) return { status: "skipped", message: "Duplicate content", existingId: dup.id };

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
      return { status: "added", id };
    }
  },
  {
    name: "mempalace_delete_drawer",
    description: "Delete a specific drawer by ID.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args: any) => {
      await storage.deleteDrawer(args.id);
      return { status: "deleted", id: args.id };
    }
  },

  // --- KNOWLEDGE GRAPH TOOLS ---
  {
    name: "mempalace_kg_query",
    description: "Query the knowledge graph for an entity's relationships.",
    inputSchema: { type: "object", properties: { entity: { type: "string" }, direction: { type: "string" } }, required: ["entity"] },
    handler: async (args: any) => kg.queryEntity(args.entity, undefined, args.direction || 'both')
  },
  {
    name: "mempalace_kg_add",
    description: "Add a relationship triple to the knowledge graph.",
    inputSchema: { type: "object", properties: { subject: { type: "string" }, predicate: { type: "string" }, object: { type: "string" } }, required: ["subject", "predicate", "object"] },
    handler: async (args: any) => {
      const id = kg.addTriple({ subject: args.subject, predicate: args.predicate, object: args.object });
      return { status: "added", id };
    }
  },
  {
    name: "mempalace_kg_invalidate",
    description: "Mark a fact as no longer true (set end date).",
    inputSchema: { type: "object", properties: { subject: { type: "string" }, predicate: { type: "string" }, object: { type: "string" } }, required: ["subject", "predicate", "object"] },
    handler: async (args: any) => {
      kg.invalidate(args.subject, args.predicate, args.object);
      return { status: "invalidated" };
    }
  },
  {
    name: "mempalace_kg_timeline",
    description: "Get chronological timeline of facts.",
    inputSchema: { type: "object", properties: { entity: { type: "string" } } },
    handler: async (args: any) => kg.timeline(args.entity)
  },
  {
    name: "mempalace_kg_stats",
    description: "Knowledge graph overview.",
    handler: async () => kg.stats()
  },

  // --- DIARY TOOLS ---
  {
    name: "mempalace_diary_write",
    description: "Write an agent diary entry.",
    inputSchema: { type: "object", properties: { agent_name: { type: "string" }, entry: { type: "string" }, topic: { type: "string" } }, required: ["agent_name", "entry"] },
    handler: async (args: any) => {
      const wing = `agent_${args.agent_name.toLowerCase()}`;
      const id = `diary_${Date.now()}`;
      await storage.upsertDrawer({
        id,
        content: args.entry,
        wing,
        room: 'diary',
        topic: args.topic || 'general',
        sourceFile: 'diary',
        chunkIndex: 0,
        addedBy: args.agent_name,
        filedAt: new Date().toISOString()
      });
      return { status: "written", id };
    }
  },
  {
    name: "mempalace_diary_read",
    description: "Read an agent's recent diary entries.",
    inputSchema: { type: "object", properties: { agent_name: { type: "string" }, limit: { type: "number" } }, required: ["agent_name"] },
    handler: async (args: any) => {
      const limit = args.limit || 10;
      const wing = `agent_${args.agent_name.toLowerCase()}`;
      // In LanceDB we just search generically but filter by wing and room.
      // Hack: we search for a common word or just pull metadata
      const results = await storage.search("", limit, { wing, room: 'diary' });
      return results;
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema || { type: "object", properties: {} }
    }))
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find(t => t.name === request.params.name);
  if (!tool) throw new Error(`Tool not found: ${request.params.name}`);
  
  const results = await tool.handler(request.params.arguments);
  return {
    content: [{ type: "text", text: JSON.stringify(results) }],
  };
});

export async function runMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MemPalace MCP server running on stdio");
}
