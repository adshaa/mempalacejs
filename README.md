# MemPalace JS

Give your AI a perfect, infinite memory. A local-first, zero-LLM memory system and Model Context Protocol (MCP) server designed to give AI assistants (like Claude, ChatGPT, and custom agents) a searchable, structured "Memory Palace."

This is a **native Node.js / TypeScript port** of the original Python [MemPalace](https://github.com/milla-jovovich/mempalace) architecture, achieving full feature parity and benchmark validation while running seamlessly in JS-native environments.

## Features

- **Full Feature Parity:** Includes all 19 tools from the original Python implementation, covering status, taxonomy, semantic search, knowledge graph triples, graph traversal (tunnels/halls), and agent diaries.
- **Zero-LLM Storage Pipeline:** MemPalace uses fast, pure regex heuristics and the AAAK dialect compressor to chunk, extract entities, map decisions, and file memories *without* relying on expensive or slow LLM API calls.
- **Embedded Vector Search:** Powered by **LanceDB** and **Transformers.js**. Generates `all-MiniLM-L6-v2` embeddings directly in V8. No Docker containers, no cloud APIs, 100% local and private.
- **Temporal Knowledge Graph:** Builds a relationship graph using `better-sqlite3`, tracking facts with temporal validity (when things became true or false).
- **AAAK Dialect:** Uses a compressed, LLM-readable dialect for efficient memory storage. See [DIALECT.md](./DIALECT.md) for the specification.
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

Point MemPalace at a project or a folder of chat transcripts to ingest them into the palace:

```bash
# Mine a codebase (default type is 'code')
mempalace mine ./my-project --wing my-project

# Mine conversation history (JSON/JSONL/Markdown)
mempalace mine ./conversations --type convo --wing legacy-chats
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

### 5. AI Context Generation

Generate context strings for your AI assistants:

```bash
# Get Identity (L0) and Essential Story (L1)
mempalace wake-up --wing my-project

# Retrieve specific memories (L2)
mempalace recall --wing my-project --room architecture --limit 5
```

### 6. Utility Commands

Handle large multi-session transcript exports:

```bash
mempalace split large_transcripts.txt --output ./individual_sessions
```

## Claude Code Integration

MemPalace JS includes hooks designed for [Claude Code](https://github.com/anthropic/claude-code) to automatically capture memories during your sessions.

- **Auto-Save Hook:** Triggers a memory save every 15 exchanges.
- **Pre-Compact Hook:** Ensures a full memory save before Claude compresses the conversation context.

To install, see the scripts in the `hooks/` directory and add them to your Claude settings.

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

## Node.js Architecture & Performance

The `mempalacejs` architecture is designed to leverage Node.js's strengths in asynchronous I/O and multi-threaded processing to provide a high-performance, local-first memory system.

*   **Non-Blocking Vector Embeddings via Worker Threads**
    Node.js's `worker_threads` module is utilized to offload CPU-intensive embedding generation (via `Transformers.js`) to background threads. This allows the system to compute vectors for hundreds of text chunks while keeping the Model Context Protocol (MCP) server and main event loop fully responsive to concurrent agent queries.

*   **Atomic SQLite Transaction Batching**
    Ingestion for the Knowledge Graph utilizes `better-sqlite3`'s native atomic transactions. By wrapping bulk entity and triple updates into single-sync operations, the system minimizes disk I/O overhead. This enables high-throughput data mining of large conversation histories and project repositories while ensuring data integrity.

*   **Contextual Entity Detection & Filtering**
    The entity detection engine employs a multi-pass heuristic approach that combines linguistic patterns with a comprehensive stopword filter. To ensure accuracy, the system uses contextual verification—checking for adjacent verb patterns (e.g., "said", "decided", "building")—to distinguish between common vocabulary and legitimate named entities like people or projects.

*   **Canonical In-Memory Normalization**
    To ensure the reliability of heuristic memory extraction, all incoming data passes through a pre-processing pipeline. This canonicalizes diverse formats (such as raw JSON exports from ChatGPT, Claude, or Slack) into a standardized format before extraction. This ensures that the system's pattern-matching heuristics (identifying decisions, preferences, and milestones) operate on clean, predictable text regardless of the source.

## Performance Benchmarks (Node.js)

The following absolute performance measurements were captured on a standard development machine using the internal `light_perf` suite:

| Component | Metric | Performance |
| :--- | :--- | :--- |
| **Knowledge Graph** | Ingestion Throughput | **~23,800 triples / sec** |
| **Vector Search** | Embedding Latency | **~129ms / chunk** |
| **UX Responsiveness** | Max Event Loop Lag | **6ms** (during heavy load) |
| **Extraction Recall** | Normalization Logic | **100% success** on raw JSON |

*Measurements represent absolute system performance. Event loop lag confirmed via concurrent heartbeat monitoring during background worker execution.*

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
