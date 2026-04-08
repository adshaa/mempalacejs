# MemPalace JS

Give your AI a perfect, infinite memory. A local-first, zero-LLM memory system and Model Context Protocol (MCP) server designed to give AI assistants (like Claude, ChatGPT, and custom agents) a searchable, structured "Memory Palace."

This is a **native Node.js / TypeScript port** of the original Python [MemPalace](https://github.com/milla-jovovich/mempalace) architecture, achieving full feature parity and benchmark validation while running seamlessly in JS-native environments.

## Features

- **Full Feature Parity:** Includes all 19 tools from the original Python implementation, covering status, taxonomy, semantic search, knowledge graph triples, graph traversal (tunnels/halls), and agent diaries.
- **Zero-LLM Storage Pipeline:** MemPalace uses fast, pure regex heuristics and the AAAK dialect compressor to chunk, extract entities, map decisions, and file memories *without* relying on expensive or slow LLM API calls.
- **Embedded Vector Search:** Powered by **LanceDB** and **Transformers.js**. Generates `all-MiniLM-L6-v2` embeddings directly in V8. No Docker containers, no cloud APIs, 100% local and private.
- **Temporal Knowledge Graph:** Builds a relationship graph using `better-sqlite3`, tracking facts with temporal validity (when things became true or false).
- **Native MCP Server:** Exposes a rich suite of tools directly to any client supporting the [Model Context Protocol](https://modelcontextprotocol.io/) (like Claude Desktop and Claude Code).
- **Benchmark Validated:** Matches the state-of-the-art Python implementation with **96.4% Recall@5** on the LongMemEval benchmark.

## Benchmark Validation

MemPalace JS has been rigorously evaluated against the **LongMemEval** dataset (500 questions, ~53 conversation sessions per question) to ensure mathematical parity with the original Python research.

| Metric | Python (Original) | **MemPalace JS (Node.js)** |
| :--- | :--- | :--- |
| **Recall@5** | 96.6% | **96.4%** |
| **NDCG@5** | 0.889 | **0.885** |

*Validation run on April 9th, 2026. Differences are within statistical variance for embedding pipeline implementations.*

## Quick Start

### 1. Installation

You can install MemPalace globally using npm:

```bash
npm install -g mempalacejs
```

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

## Model Context Protocol (MCP) Integration

MemPalace JS acts as a high-performance memory backend for AI agents. To give Claude access to your Memory Palace, add the MCP server to your configuration.

**For Claude Desktop (`~/.claude/claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "mempalace": {
      "command": "npx",
      "args": ["-y", "mempalacejs", "mcp"]
    }
  }
}
```

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

## Testing & Development

This project maintains strict test parity with the Python original.

- **37 Tests Passed:** Covering normalization, AAAK compression, Knowledge Graph logic, project mining, and vector search.
- **Test Command:** `npm run test` (Powered by `vitest`).

### Running Benchmarks
To reproduce the LongMemEval results:

```bash
# 1. Download the dataset
mkdir -p benchmarks/data
curl -fsSL -o benchmarks/data/longmemeval_s_cleaned.json https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json

# 2. Run the runner
npx tsx src/benchmarks/longmemeval_bench.ts benchmarks/data/longmemeval_s_cleaned.json
```

## License

MIT
