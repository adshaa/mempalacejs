# MemPalace JS Optimization Plan

This document outlines the strategy for maximizing the performance of the MemPalace Node.js/TypeScript engine, leveraging V8-specific optimizations, asynchronous I/O, and worker threads.

## Phase 1: High-Throughput Embedding Pipeline
**Goal:** Minimize IPC overhead and maximize ONNX runtime efficiency.

1.  **Batch Worker Logic:** 
    - Refactor `src/storage/embedding_worker.ts` to accept `string[]` instead of single `string`.
    - Update the internal Transformers.js pipeline call to process the batch in one go.
2.  **Vector Storage Batching:** 
    - Add `getEmbeddings(texts: string[])` to `VectorStorage.ts`.
    - Update `upsertDrawer` and `mine` operations to chunk inputs into batches (size 10-20).
3.  **Request Coalescing:** 
    - Implement a debouncer in `getEmbedding` to bundle near-simultaneous tool call requests into a single worker message.

## Phase 2: Optimized Transport Layer (MCP Serialization)
**Goal:** Speed up JSON-RPC communication for AI agents.

1.  **Hybrid Schema Serialization:** 
    - Integrate `fast-json-stringify`.
    - Define a pre-compiled schema for core Python-parity fields (`id`, `content`, `wing`, `room`, `filedAt`).
    - Use `additionalProperties: true` to support dynamic user-defined metadata.
2.  **Parallel Tool Execution:** 
    - Audit all MCP search/recall tools to ensure they use `Promise.all()` for multi-wing or multi-room lookups.

## Phase 3: Memory-Efficient Internal Streaming
**Goal:** Move from "Buffer-and-Send" to "Stream-and-Yield".

1.  **Generator-based Memory Stack:** 
    - Refactor `src/core/layers.ts` to use `AsyncGenerators`.
    - Yield context chunks as they are retrieved, reducing peak RSS (memory) during large recalls.
2.  **Lazy Heuristics:** 
    - Apply regex extraction and AAAK dialect compression on-the-fly as data streams through the pipeline.

## Phase 4: Production Packaging & NPM Polish
**Goal:** Zero-config global installation.

1.  **Worker Resolution:** Finalize robust absolute path resolution for `embedding_worker.js`.
2.  **Binary Mapping:** Map `mempalace` command to the CLI entry point in `package.json`.
3.  **Asset Inclusion:** Ensure `hooks/` and documentation are in the NPM `files` whitelist.

## Phase 5: Verification & Benchmarking
**Goal:** Mathematically prove performance gains.

1.  **Latency Audit:** Measure TTFM (Time to First Memory) and Ingestion Throughput.
2.  **Accuracy Guardrails:** Verify **96.4% R@5** accuracy is maintained post-optimization using `longmemeval_bench.ts`.
