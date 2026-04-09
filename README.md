# MemPalace JS

[![NPM Version](https://img.shields.io/npm/v/mempalacejs.svg)](https://www.npmjs.com/package/mempalacejs)
[![License](https://img.shields.io/npm/l/mempalacejs.svg)](https://github.com/adshaa/mempalacejs/blob/dev/LICENSE)
![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)
![Recall Accuracy](https://img.shields.io/badge/Recall@5-96.4%25-brightgreen)
![Node Version](https://img.shields.io/node/v/mempalacejs)

![Ingestion Speed](https://img.shields.io/badge/Ingestion-28.3%20dr%2Fs-blue)
![Startup Latency](https://img.shields.io/badge/Startup-%3C150ms-success)
![Fluidity](https://img.shields.io/badge/UI_Fluidity-90.1%25-brightgreen)
![Search Latency](https://img.shields.io/badge/Search-Sub--10ms-blueviolet)

Give your AI a perfect, infinite memory. A local-first, zero-LLM memory system and Model Context Protocol (MCP) server designed to give AI assistants (like Claude, ChatGPT, and custom agents) a searchable, structured "Memory Palace."

[**Jump to Quick Start 🚀**](#quick-start-plug-and-play-mcp-or-full-memory-journey)

This is a **native Node.js / TypeScript port** of the original Python [MemPalace](https://github.com/milla-jovovich/mempalace) architecture, achieving full feature parity and benchmark validation while running seamlessly in JS-native environments.



***

## 🏛️ How it Works

MemPalace organizes information using a spatial metaphor to maximize context efficiency:

```text
  [ USER AGENT ] <──( MCP )──> [ MEMPALACE ENGINE ]
                                       │
      ┌────────────────────────────────┼────────────────────────────────┐
      │ Layer 0: Identity (Loci)       │ Layer 1: Essential Story (AAAK) │
      │ "Who am I? What's my role?"    │ "The core project milestones"   │
      └────────────────────────────────┼────────────────────────────────┘
                                       │
      ┌────────────────────────────────┼────────────────────────────────┐
      │ Layer 2: On-Demand (Rooms)     │ Layer 3: Deep Search (Vector)   │
      │ "Specific topics (e.g. Auth)"  │ "Semantic match for current Q"  │
      └────────────────────────────────┼────────────────────────────────┘
                                       │
                         [ LanceDB ] [ SQLite ] [ Filesystem ]
```

- **Wings:** High-level domains (e.g., `wing_projectA`, `wing_personal`).
- **Rooms:** Topics within a wing (e.g., `room_architecture`, `room_decisions`).
- **Drawers:** The actual text chunks (vectors) stored in LanceDB.
- **Tunnels:** Cross-wing connections dynamically built when a Room appears in multiple Wings.

***

## Why MemPalace JS? (Industrial-Grade Memory)

While most local RAG implementations use simple file buffers or basic SQLite extensions, MemPalace JS is engineered for high-scale, production agentic workflows.

*   **Rust-Powered Vector Engine:** Powered by **LanceDB**. Unlike standard SQLite-based search, our engine is IOPS-optimized and scales to millions of memories with sub-millisecond retrieval.
*   **Zero-Lag UI & Heartbeats:** CPU-intensive embedding math is offloaded to background **Worker Threads**. This keeps the MCP server 100% responsive, preventing the "hanging" heartbeats and timeouts common in single-threaded AI tools.
*   **O(1) Context Streaming:** Our **Async Generator** retrieval treats memory like a pipeline, not a buffer. Recalling a massive "room" of context consumes minimal RAM, regardless of the dataset size.
*   **Self-Contained Stability:** By internalizing all pure-JS dependencies, we provide a **Zero-Config bundle** that eliminates `node_modules` bloat and version conflicts with other CLI tools.

***

## Features

- **Full Feature Parity:** Includes all 19 tools from the original Python implementation (Status, Graph Nav, Knowledge Graph, Diary).
- **Zero-LLM Storage Pipeline:** Fast, pure regex heuristics for fact extraction—zero API costs and instant processing.
- **Embedded Hybrid Search:** Combines **LanceDB** vectors with a **Temporal Knowledge Graph** (`better-sqlite3`).
- **AAAK Dialect Compression:** High-density, LLM-readable memory storage that saves 80% on tokens while preserving context.
- **Native MCP Server:** Seamless integration with **Claude Code** and **Claude Desktop**.

***

## ⚡ AAAK at a glance (Lossy Memory Compression)

MemPalace JS automatically compresses long project histories into high-density **AAAK** (Asynchronous AI Abbreviated Knowledge) dialect. This saves tokens while preserving the "who, what, and why" for the LLM.

**Original Text:**
> Jordan decided to switch the database to PostgreSQL because of the complex join requirements. This was a major milestone for the backend team.

**AAAK Output:**
> PROJ: backend | *fierce* JOR→switch DB to Postgres (joins) | ★★★★ | MIL: backend-db-switch

***

## Documentation

- **[Quick Start Guide](#quick-start)**
- **[CLI Reference Guide](./docs/CLI_REFERENCE.md)**
- **[MCP Integration (Claude Setup)](./docs/MCP_INTEGRATION.md)**
- **[Configuration & Customization](./docs/CONFIGURATION.md)**
- **[Technical Architecture](./docs/ARCHITECTURE.md)**
- **[AAAK Dialect Specification](./DIALECT.md)**

---

## Benchmark Validation

MemPalace JS has been rigorously evaluated against the **LongMemEval** dataset (500 questions, ~53 conversation sessions per question) to ensure mathematical parity with the original Python research.

| Metric | Python (Original) | **MemPalace JS (Node.js)** |
| :--- | :--- | :--- |
| **Recall@5** | 96.6% | **96.4%** |
| **NDCG@5** | 0.889 | **0.885** |

*Validation run on April 9th, 2026. Differences are within statistical variance for embedding pipeline implementations.*

## Quick Start: Plug-and-Play MCP or Full Memory Journey

MemPalace JS is designed to be **Plug-and-Play**. You can connect it to your AI agent immediately without any preconfiguration. It will start with a fresh, empty palace that grows as you chat.

For a more comprehensive experience, follow the structured journey below.

### 🚀 Step 0: Immediate Start (Plug-and-Play MCP)
If you want to start right away, just add the MCP server to your agent's configuration (see **Step 3**). The server will automatically initialize your local environment (`~/.mempalace`) and be ready to save your first memory.

---

### Step 1: Prepare the Engine
Install the package and pre-download the 90MB AI model weights. This ensures your first memory recall is instantaneous.

```bash
# 1. Global Installation
npm install -g mempalacejs

# 2. Pre-download AI models
mempalace setup
```

### Step 2: Fuel the Palace (Mine & Initialize)
A palace is only as good as what's inside. Define who you are and index your first project.

```bash
# 1. Define your Identity (L0 context)
mempalace init

# 2. Mine your project codebase into a Wing
mempalace mine ./my-project --wing my-project
```

### Step 3: Connect your Agent
Now that the palace has "fuel," connect it to your favorite assistant.

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

***

## 🔄 The Two-Way Connection

MemPalace JS isn't just a "read-only" database; it's a living extension of your AI.

1.  **System-to-Agent:** Use the CLI (`mempalace mine`) to index documentation, code, and legacy logs. The agent immediately "remembers" these via MCP tools.
2.  **Agent-to-System:** As you chat, the agent can use `mempalace_add_drawer` or `mempalace_kg_add` to **proactively save new facts** about your preferences, decisions, or project status.
3.  **Universal Sync:** Because they share the same local vault (`~/.mempalace`), any memory saved by the agent in Claude is immediately searchable in your terminal.

***

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

MemPalace JS acts as a high-performance memory backend for AI agents.

### Common Tools for Agents
When connected, your agent can call tools such as:
- `mempalace_search`: Semantic search across all memories.
- `mempalace_wake_up`: Load the Identity (L0) and project milestones (L1).
- `mempalace_kg_query`: Query the temporal relationship graph for entities.
- `mempalace_diary_write`: Allow the agent to record its own observations.
- `mempalace_traverse_graph`: Navigate between connected topics and wings.

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

*   **Self-Contained & Lazy-Loaded:**
    To ensure the snappiest CLI experience, MemPalace bundles all pure-JS dependencies into a single distribution and implements **true lazy-loading** for heavy math libraries. The `Transformers.js` engine is only initialized when a command specifically requires semantic math, allowing status and navigation commands to start in **<150ms**.

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

- **44 Tests Passed:** Covering normalization, AAAK compression, Knowledge Graph logic, project mining, and vector search.
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

### Contributing & Issues
We welcome contributions! Please feel free to open an issue or submit a pull request on [GitHub](https://github.com/adshaa/mempalacejs).

***

## License

MIT
