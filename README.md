# MemPalace JS

Give your AI a perfect, infinite memory. A local-first, zero-LLM memory system and Model Context Protocol (MCP) server designed to give AI assistants (like Claude, ChatGPT, and custom agents) a searchable, structured "Memory Palace."

This is a **native Node.js / TypeScript port** of the original Python [MemPalace](https://github.com/milla-jovovich/mempalace) architecture, achieving benchmark parity while running seamlessly in JS-native environments.

## Features

- **Zero-LLM Storage Pipeline:** MemPalace uses fast, pure regex heuristics and the AAAK dialect compressor to chunk, extract entities, map decisions, and file memories *without* relying on expensive or slow LLM API calls.
- **Embedded Vector Search:** Powered by **LanceDB** and **Transformers.js**. Generates `all-MiniLM-L6-v2` embeddings directly in V8. No Docker containers, no cloud APIs, 100% local and private.
- **Temporal Knowledge Graph:** Builds a relationship graph using `better-sqlite3`, tracking facts with temporal validity (when things became true or false).
- **Native MCP Server:** Exposes powerful read/write tools directly to any client supporting the [Model Context Protocol](https://modelcontextprotocol.io/) (like Claude Desktop and Claude Code).
- **Benchmark Proven:** Achieves **96.4% Recall@5** on the grueling LongMemEval benchmark, matching the state-of-the-art Python implementation.

## Quick Start

### 1. Installation

You can install MemPalace globally using npm:

```bash
npm install -g mempalacejs
```

*(Alternatively, you can run it directly via `npx mempalacejs` without installing).*

### 2. Initialization

Set up your personal Memory Palace (defaults to `~/.mempalace/palace`):

```bash
mempalace init
```
This runs an interactive onboarding flow to configure your initial rooms and wings.

### 3. Mining Data

Point MemPalace at a project, a folder of Markdown files, or a chat transcript export to ingest it into the palace:

```bash
mempalace mine ./my-project --wing my-project
```

### 4. Search and Status

Search your ingested memories semantically:

```bash
mempalace search "Why did we switch to TypeScript?"
```

Check the health, taxonomy, and stats of your Palace:

```bash
mempalace status
```

## Using with Claude Desktop / Claude Code (MCP)

MemPalace is built to act as a memory backend for AI assistants. To give Claude access to your Memory Palace, add the MCP server to your Claude configuration.

**For Claude Desktop (`~/.claude/claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "mempalace": {
      "command": "mempalace",
      "args": ["mcp"]
    }
  }
}
```

*Note: Ensure you have installed the package globally with `npm install -g mempalacejs` first.*

## Architecture

MemPalace organizes memories using a spatial metaphor:
- **Wings:** High-level domains (e.g., `wing_projectA`, `wing_personal`).
- **Rooms:** Topics within a wing (e.g., `room_architecture`, `room_decisions`).
- **Drawers:** The actual text chunks (vectors) stored in LanceDB.
- **Halls (Tunnels):** Cross-wing connections dynamically built when a Room appears in multiple Wings.

### Tech Stack
- **Vector Storage:** [LanceDB](https://lancedb.com/) (Serverless, embedded vector DB)
- **Embeddings:** [Transformers.js](https://huggingface.co/docs/transformers.js) (`Xenova/all-MiniLM-L6-v2`)
- **Relational DB:** `better-sqlite3` (Knowledge graph & triples)
- **Tooling:** Model Context Protocol (MCP) SDK, Commander.js

## Running Benchmarks

To reproduce the LongMemEval benchmark results (~96.4% Recall@5):

```bash
# 1. Download the dataset
mkdir -p benchmarks/data
curl -fsSL -o benchmarks/data/longmemeval_s_cleaned.json https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json

# 2. Run the benchmark runner
npx tsx src/benchmarks/longmemeval_bench.ts benchmarks/data/longmemeval_s_cleaned.json
```

## Contributing

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Use `npm run build` to build the TypeScript files via `tsup`.
4. Use `npm run test` to execute the `vitest` test suite.

## License

MIT
