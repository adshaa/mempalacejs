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

Point MemPalace at a project or a folder of chat transcripts to ingest them into the palace. MemPalace **automatically respects your `.gitignore`** files to ensure only relevant source code is indexed.

```bash
# Mine a codebase (default type is 'code')
mempalace mine ./my-project --wing my-project

# Mine conversation history (JSON/JSONL/Markdown)
mempalace mine ./conversations --type convo --wing legacy-chats
```

#### Custom Routing (`mempalace.yaml`)
You can add a `mempalace.yaml` file to your project root to customize how files are routed to rooms:

```yaml
wing: "my-custom-wing"
rooms:
  - name: "security"
    keywords: ["auth", "login", "encryption", "permission"]
  - name: "ui-engine"
    keywords: ["react", "component", "styling", "tailwind"]
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

### Installation
You can install the hooks to your local `.mempalace` directory automatically:

```bash
mempalace install-hooks
```

Follow the on-screen instructions to add them to your Claude configuration.

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

*   **Batched Embedding Pipeline:**
    Utilizes `worker_threads` to offload CPU-intensive embedding generation (via `Transformers.js`) to background threads. The system implements **Request Coalescing**, bundling multiple simultaneous embedding requests into a single worker pass to minimize IPC overhead and maximize ONNX runtime efficiency.

*   **Memory-Efficient Context Streaming:**
    The context generation layers (L1-L3) are built on **AsyncGenerators**. Instead of buffering massive memory blocks in RAM, MemPalace yields context chunks as they are retrieved and processed, significantly reducing peak memory (RSS) and improving "Time to First Byte" for the AI agent.

*   **Blazing-Fast Serialization:**
    Uses **fast-json-stringify** for MCP tool responses. By employing pre-compiled, schema-aware serialization for core memory fields, the server can deliver large context windows up to 10x faster than standard `JSON.stringify` while maintaining dynamic flexibility for user metadata.

*   **Atomic SQLite Transaction Batching:**
    Ingestion for the Knowledge Graph utilizes `better-sqlite3`'s native atomic transactions, enabling high-throughput data mining (~23,800 triples/sec) while ensuring strict data integrity.

## Performance Delta & Optimization Results

The recent optimization pass focused on parallelizing the embedding pipeline and streamlining memory transport.

| Component | Metric | Performance | vs. Python / Baseline |
| :--- | :--- | :--- | :--- |
| **Ingestion** | Throughput | **28.3 drawers / sec** | **2.5x Faster** |
| **UX Fluidity** | Main Thread Responsiveness | **90.1%** | **Fluid during load** |
| **Serialization** | Tool Response Speed | **~17ms / 100 results** | **Up to 10x Faster** |
| **Memory usage** | Peak RSS Footprint | **O(1) Streaming** | **90% lower peak** |

*Benchmarks captured during 500-drawer ingestion on a standard development machine. "Fluidity" measures event loop responsiveness via a concurrent heartbeat monitor during heavy background CPU/IO load.*

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
