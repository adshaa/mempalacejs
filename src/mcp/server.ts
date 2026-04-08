import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { VectorStorage } from "../storage/vector";
import { KnowledgeGraph } from "../storage/sqlite";
import { MempalaceConfig } from "../core/config";
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

// --- Tool Definitions & Handlers ---
const tools = [
  {
    name: "mempalace_status",
    description: "Palace overview",
    handler: async () => ({
      total_drawers: (await storage.getTaxonomy()).total,
      palace_path: config.palacePath
    })
  },
  {
    name: "mempalace_list_wings",
    description: "List wings",
    handler: async () => ({
      wings: (await storage.getTaxonomy()).wings
    })
  },
  {
    name: "mempalace_search",
    description: "Semantic search. Returns verbatim content.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
    handler: async (args: any) => await storage.search(args.query, args.limit || 5)
  },
  {
    name: "mempalace_kg_query",
    description: "Query KG",
    inputSchema: { type: "object", properties: { entity: { type: "string" } }, required: ["entity"] },
    handler: async (args: any) => await kg.queryEntity(args.entity)
  },
  {
    name: "mempalace_add_drawer",
    description: "Add drawer",
    inputSchema: { type: "object", properties: { wing: { type: "string" }, room: { type: "string" }, content: { type: "string" } }, required: ["wing", "room", "content"] },
    handler: async (args: any) => await storage.upsertDrawer({
      id: `drawer_${args.wing}_${args.room}_${Date.now()}`,
      content: args.content,
      wing: args.wing,
      room: args.room,
      sourceFile: 'mcp',
      chunkIndex: 0,
      addedBy: 'mcp',
      filedAt: new Date().toISOString()
    })
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("MemPalace MCP server running on stdio");
