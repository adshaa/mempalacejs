# Technical Architecture

MemPalace JS is a high-performance, local-first memory engine. It follows a "Method of Loci" spatial metaphor to organize AI context.

## 1. The 4-Layer Memory Stack

MemPalace organizes information into layers to maximize the utility of the AI's limited context window.

- **Layer 0: Identity (Static):** High-level persona info (e.g., "I am an engineer working on VR"). Always loaded.
- **Layer 1: Essential Story (AAAK):** The most important milestones and decisions across the entire project, compressed using the AAAK dialect. Always loaded.
- **Layer 2: On-Demand (Topic):** Specific verbatim text chunks from a requested "Room" (e.g., all memories about "auth"). Loaded when requested by the agent.
- **Layer 3: Deep Search (Vector):** Semantic search results from LanceDB based on the current user query.

---

## 2. High-Performance Design

To overcome the traditional bottlenecks of AI memory systems in Python, MemPalace JS utilizes several Node.js-specific optimizations:

### Non-Blocking Worker Threads
Embedding generation (math-heavy) is offloaded to `worker_threads` running ONNX Runtime (Transformers.js).
- **Request Coalescing:** If multiple tool calls trigger embeddings simultaneously, the main thread bundles them into a single message to the worker.
- **Responsiveness:** This keeps the MCP server's main thread free to respond to heartbeats and pings, preventing agent timeouts.

### Async Generators (Internal Streaming)
Retreiving 50MB of memory context can cause memory spikes. MemPalace uses `AsyncGenerator` to stream context chunks from the database to the output buffer.
- This ensures an **O(1) memory footprint** for context generation.

### Schema-Aware Serialization
Standard `JSON.stringify` is slow for massive arrays of text objects. MemPalace uses `fast-json-stringify` with pre-compiled schemas for the core `Drawer` objects.
- **Result:** Context retrieval is up to 10x faster than traditional implementations.

---

## 3. Storage Layer

- **LanceDB (Vector):** An embedded, serverless vector database. It stores the embeddings of every "Drawer" (text chunk) and provides fast ANN (Approximate Nearest Neighbor) search.
- **Better-SQLite3 (Relational):** Powers the Knowledge Graph. It tracks triples (subject-predicate-object) with temporal validity.
- **Filesystem:** Used for identity files, registry logs, and configuration.

---

## 4. Heuristic Extraction (LLM-Free)

The core "Mining" engine does not use an LLM. It uses a series of high-speed regex passes to:
1. Identify **Decisions** (e.g., "We decided to use Node.js").
2. Detect **Milestones** (e.g., "shipped version 1.0").
3. Capture **Emotions** (e.g., "I'm feeling frustrated with the build speed").

This allows the system to index massive codebases and chat logs in seconds for free, rather than spending dollars on tokens and waiting minutes for LLM extraction.
