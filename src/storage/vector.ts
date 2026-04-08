import * as lancedb from '@lancedb/lancedb';
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import { Drawer } from '../core/types';

export class VectorStorage {
  private dbPath: string;
  private tableName: string;
  private db: lancedb.Connection | null = null;
  private worker: Worker | null = null;
  private pendingRequests: Map<string, { resolve: (val: number[][]) => void, reject: (err: Error) => void }> = new Map();
  private requestIdCounter = 0;
  
  private coalescingQueue: { text: string, resolve: (val: number[]) => void, reject: (err: Error) => void }[] = [];
  private coalesceTimeout: NodeJS.Timeout | null = null;

  constructor(dbPath: string, tableName: string) {
    this.dbPath = dbPath;
    this.tableName = tableName;
  }

  public async init() {
    if (!this.db) {
      this.db = await lancedb.connect(this.dbPath);
    }
    if (!this.worker) {
      this.initWorker();
    }
  }

  private initWorker() {
    // Robust worker path resolution for production (bundled) and development
    // 1. Check same dir (for bundled dist/storage/index.js)
    // 2. Check storage/ dir (for bundled dist/index.js)
    // 3. Check ../storage dir (for bundled dist/cli/index.js)
    // 4. Check src/storage dir (for development)
    const possiblePaths = [
      path.join(__dirname, 'embedding_worker.js'),
      path.join(__dirname, 'storage', 'embedding_worker.js'),
      path.join(__dirname, '..', 'storage', 'embedding_worker.js'),
      path.join(__dirname, 'embedding_worker.ts'),
    ];
    
    const workerPath = possiblePaths.find(p => fs.existsSync(p));

    if (!workerPath) {
      throw new Error(`Could not locate embedding_worker.js in any of: ${possiblePaths.join(', ')}`);
    }

    try {
      const isTs = workerPath.endsWith('.ts');
      this.worker = new Worker(workerPath, {
        execArgv: isTs ? ['-r', 'ts-node/register'] : []
      });

      this.worker.on('message', (msg) => {
        const { id, embeddings, error } = msg;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          if (error) pending.reject(new Error(error));
          else pending.resolve(embeddings);
          this.pendingRequests.delete(id);
        }
      });

      this.worker.on('error', (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('Embedding worker error:', error);
        for (const pending of this.pendingRequests.values()) {
          pending.reject(error);
        }
        this.pendingRequests.clear();
        this.worker = null;
      });
    } catch (e) {
      console.error('Failed to initialize embedding worker', e);
      throw e;
    }
  }

  public async getEmbedding(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.coalescingQueue.push({ text, resolve, reject });
      if (!this.coalesceTimeout) {
        this.coalesceTimeout = setTimeout(() => this.processCoalescedQueue(), 10); // 10ms batching window
      }
    });
  }

  private async processCoalescedQueue() {
    if (this.coalescingQueue.length === 0) return;
    const batch = this.coalescingQueue.slice();
    this.coalescingQueue = [];
    this.coalesceTimeout = null;

    try {
      const embeddings = await this.getEmbeddings(batch.map(b => b.text));
      if (!embeddings || embeddings.length !== batch.length) {
        throw new Error(`Worker returned ${embeddings?.length} embeddings for ${batch.length} texts`);
      }
      for (let i = 0; i < batch.length; i++) {
        batch[i].resolve(embeddings[i]);
      }
    } catch (e) {
      for (const b of batch) {
        b.reject(e as Error);
      }
    }
  }

  public async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.worker) this.initWorker();
    
    const id = `req_${Date.now()}_${this.requestIdCounter++}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.worker!.postMessage({ id, texts });
    });
  }

  public async upsertDrawer(drawer: Drawer): Promise<void> {
    await this.upsertDrawers([drawer]);
  }

  public async upsertDrawers(drawers: Drawer[]): Promise<void> {
    if (!this.db) await this.init();
    
    const needsEmbedding = drawers.filter(d => !d.vector);
    if (needsEmbedding.length > 0) {
      const texts = needsEmbedding.map(d => d.content);
      const embeddings = await this.getEmbeddings(texts);
      for (let i = 0; i < needsEmbedding.length; i++) {
        needsEmbedding[i].vector = embeddings[i];
      }
    }

    try {
      const tableNames = await this.db!.tableNames();
      const records = drawers.map(drawer => ({
        id: drawer.id,
        vector: drawer.vector,
        content: drawer.content,
        wing: drawer.wing,
        room: drawer.room,
        sourceFile: drawer.sourceFile,
        chunkIndex: drawer.chunkIndex,
        addedBy: drawer.addedBy,
        filedAt: drawer.filedAt,
        hall: drawer.hall || '',
        topic: drawer.topic || '',
        type: drawer.type || '',
        agent: drawer.agent || '',
        date: drawer.date || ''
      }));

      if (!tableNames.includes(this.tableName)) {
        await this.db!.createTable(this.tableName, records);
      } else {
        const table = await this.db!.openTable(this.tableName);
        await table.add(records);
      }
    } catch (e) {
      console.error(`Failed to upsert drawers`, e);
      throw e;
    }
  }

  public async search(
    query: string, 
    limit: number = 5,
    filter?: { wing?: string, room?: string }
  ): Promise<(Drawer & { similarity: number })[]> {
    if (!this.db) await this.init();
    const table = await this.db!.openTable(this.tableName);
    const queryVector = await this.getEmbedding(query);
    
    let searchBuilder = table.search(queryVector).limit(limit);
    
    let whereClauses: string[] = [];
    if (filter?.wing) whereClauses.push(`wing = '${filter.wing}'`);
    if (filter?.room) whereClauses.push(`room = '${filter.room}'`);

    if (whereClauses.length > 0) {
      searchBuilder = searchBuilder.where(whereClauses.join(' AND '));
    }
    
    const results = await searchBuilder.toArray();

    return results.map(r => {
      // LanceDB returns '_distance'. Assuming L2 distance and normalized vectors:
      // cosine_sim = 1 - (L2^2 / 2)
      const dist = (r as any)._distance || 0;
      const similarity = 1 - (dist * dist) / 2;
      return {
        ...r,
        similarity: parseFloat(similarity.toFixed(3))
      } as Drawer & { similarity: number };
    });
  }

  public async getTaxonomy(): Promise<{ wings: Record<string, number>, rooms: Record<string, number>, total: number }> {
    if (!this.db) await this.init();
    if (!(await this.hasTable())) {
      return { wings: {}, rooms: {}, total: 0 };
    }

    const table = await this.db!.openTable(this.tableName);
    const rows = await table.query().select(['wing', 'room']).toArray();
    
    const wings: Record<string, number> = {};
    const rooms: Record<string, number> = {};
    
    for (const row of rows) {
      const w = (row.wing as string) || 'unknown';
      const r = (row.room as string) || 'unknown';
      wings[w] = (wings[w] || 0) + 1;
      rooms[r] = (rooms[r] || 0) + 1;
    }
    return { wings, rooms, total: rows.length };
  }

  public async hasTable(): Promise<boolean> {
    if (!this.db) await this.init();
    const tableNames = await this.db!.tableNames();
    return tableNames.includes(this.tableName);
  }

  public async getAllMetadata(columns: string[]): Promise<Record<string, unknown>[]> {
    if (!(await this.hasTable())) return [];
    const table = await this.db!.openTable(this.tableName);
    return await table.query().select(columns).toArray();
  }

  public async listDrawers(
    limit: number = 10,
    filter?: { wing?: string, room?: string }
  ): Promise<Drawer[]> {
    if (!this.db) await this.init();
    if (!(await this.hasTable())) return [];
    const table = await this.db!.openTable(this.tableName);
    
    let query = table.query();
    
    let whereClauses: string[] = [];
    if (filter?.wing) whereClauses.push(`wing = '${filter.wing}'`);
    if (filter?.room) whereClauses.push(`room = '${filter.room}'`);

    if (whereClauses.length > 0) {
      query = query.where(whereClauses.join(' AND '));
    }
    
    const results = await query.limit(limit).toArray();
    return results as any[];
  }

  public async clearTable(): Promise<void> {
    if (!this.db) await this.init();
    const tableNames = await this.db!.tableNames();
    if (tableNames.includes(this.tableName)) {
      await this.db!.dropTable(this.tableName);
    }
  }

  public async deleteDrawer(id: string): Promise<void> {
    if (!this.db) await this.init();
    if (!(await this.hasTable())) return;
    const table = await this.db!.openTable(this.tableName);
    await table.delete(`id = '${id}'`);
  }

  public async close() {
    if (this.coalesceTimeout) {
      clearTimeout(this.coalesceTimeout);
      this.coalesceTimeout = null;
    }
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
