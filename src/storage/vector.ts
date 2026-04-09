import * as lancedb from '@lancedb/lancedb';
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import { Drawer } from '../core/types';

export class VectorStorage {
  private dbPath: string;
  private tableName: string;
  
  // Singleton worker and requests map
  private static globalWorker: Worker | null = null;
  private static workerPromise: Promise<Worker> | null = null;
  private static pendingRequests: Map<string, { resolve: (val: number[][]) => void, reject: (err: Error) => void }> = new Map();
  private static requestIdCounter = 0;

  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private tablePromise: Promise<lancedb.Table> | null = null;
  
  private coalescingQueue: { text: string, resolve: (val: number[]) => void, reject: (err: Error) => void }[] = [];
  private coalesceTimeout: NodeJS.Timeout | null = null;

  constructor(dbPath: string, tableName: string) {
    this.dbPath = dbPath;
    this.tableName = tableName;
  }

  public async init() {
    if (!this.db) {
      try {
        this.db = await lancedb.connect(this.dbPath);
      } catch (e: any) {
        console.error(`❌ Failed to connect to LanceDB at ${this.dbPath}: ${e.message}`);
        throw e;
      }
    }
  }

  private async getTable(): Promise<lancedb.Table> {
    if (!this.db) await this.init();
    if (this.table) return this.table;
    if (this.tablePromise) return this.tablePromise;

    this.tablePromise = (async () => {
      try {
        const tableNames = await this.db!.tableNames();
        if (!tableNames.includes(this.tableName)) {
          throw new Error(`Table ${this.tableName} does not exist.`);
        }
        const table = await this.db!.openTable(this.tableName);
        this.table = table;
        return table;
      } catch (e) {
        this.tablePromise = null; // Allow retry
        throw e;
      }
    })();

    return this.tablePromise;
  }

  public async setup(): Promise<void> {
    const worker = await this.ensureWorker();
    const id = `setup_${Date.now()}`;
    return new Promise((resolve, reject) => {
      VectorStorage.pendingRequests.set(id, { resolve: () => resolve(), reject });
      worker.postMessage({ id, type: 'SETUP' });
    });
  }

  private async ensureWorker(): Promise<Worker> {
    if (VectorStorage.globalWorker) return VectorStorage.globalWorker;
    if (VectorStorage.workerPromise) return VectorStorage.workerPromise;

    VectorStorage.workerPromise = (async () => {
      let baseDir = __dirname;
      const possiblePaths = [
        path.join(baseDir, 'embedding_worker.js'),
        path.join(baseDir, 'embedding_worker.mjs'),
        path.join(baseDir, 'storage', 'embedding_worker.js'),
        path.join(baseDir, 'storage', 'embedding_worker.mjs'),
        path.join(baseDir, '..', 'storage', 'embedding_worker.js'),
        path.join(baseDir, '..', 'storage', 'embedding_worker.mjs'),
        path.join(baseDir, 'embedding_worker.ts'),
      ];
      
      const workerPath = possiblePaths.find(p => fs.existsSync(p));
      if (!workerPath) throw new Error(`Could not locate embedding_worker.js`);

      const isTs = workerPath.endsWith('.ts');
      const worker = new Worker(workerPath, {
        execArgv: isTs ? ['-r', 'ts-node/register'] : []
      });

      worker.on('message', (msg) => {
        const { id, embeddings, error, status } = msg;
        const pending = VectorStorage.pendingRequests.get(id);
        if (pending) {
          if (error) {
            pending.reject(new Error(error));
          } else if (status === 'ready') {
            pending.resolve([]);
          } else if (embeddings) {
            pending.resolve(embeddings);
          } else {
            pending.reject(new Error(`Worker sent message with no embeddings or error for request ${id}`));
          }
          VectorStorage.pendingRequests.delete(id);
        }
      });

      worker.on('error', (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('Embedding worker error:', error);
        for (const pending of VectorStorage.pendingRequests.values()) {
          pending.reject(error);
        }
        VectorStorage.pendingRequests.clear();
        VectorStorage.globalWorker = null;
        VectorStorage.workerPromise = null;
      });

      VectorStorage.globalWorker = worker;
      return worker;
    })();

    return VectorStorage.workerPromise;
  }

  public async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const worker = await this.ensureWorker();
    const id = `req_${Date.now()}_${VectorStorage.requestIdCounter++}`;
    
    return new Promise((resolve, reject) => {
      VectorStorage.pendingRequests.set(id, { resolve, reject });
      worker.postMessage({ id, texts });
    });
  }

  public async getEmbedding(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.coalescingQueue.push({ text, resolve, reject });
      if (!this.coalesceTimeout) {
        this.coalesceTimeout = setTimeout(() => this.processCoalescedQueue(), 10);
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
        throw new Error(`Worker returned ${embeddings?.length} embeddings but expected ${batch.length}`);
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

  public async upsertDrawer(drawer: Drawer): Promise<void> {
    await this.upsertDrawers([drawer]);
  }

  public async upsertDrawers(drawers: Drawer[]): Promise<void> {
    if (drawers.length === 0) return;
    if (!this.db) await this.init();
    
    const needsEmbedding = drawers.filter(d => !d.vector);
    if (needsEmbedding.length > 0) {
      const texts = needsEmbedding.map(d => d.content);
      try {
        const embeddings = await this.getEmbeddings(texts);
        if (!embeddings || embeddings.length !== needsEmbedding.length) {
          throw new Error(`Failed to get embeddings: expected ${needsEmbedding.length}, got ${embeddings?.length}`);
        }
        for (let i = 0; i < needsEmbedding.length; i++) {
          needsEmbedding[i].vector = embeddings[i];
        }
      } catch (e: any) {
        console.error(`❌ Embedding generation failed: ${e.message}`);
        throw e;
      }
    }

    try {
      const records = drawers.map(drawer => ({
        id: drawer.id,
        vector: drawer.vector,
        content: drawer.content,
        wing: drawer.wing,
        room: drawer.room,
        sourceFile: drawer.sourceFile,
        sourceMtime: drawer.sourceMtime || 0,
        chunkIndex: drawer.chunkIndex,
        addedBy: drawer.addedBy,
        filedAt: drawer.filedAt,
        hall: drawer.hall || '',
        topic: drawer.topic || '',
        type: drawer.type || '',
        agent: drawer.agent || '',
        date: drawer.date || ''
      }));

      const tableNames = await this.db!.tableNames();
      if (!tableNames.includes(this.tableName)) {
        try {
          this.table = await this.db!.createTable(this.tableName, records);
          this.tablePromise = Promise.resolve(this.table);
        } catch (e: any) {
          if (e.message?.includes('already exists')) {
             const table = await this.getTable();
             await table.add(records);
          } else throw e;
        }
      } else {
        const table = await this.getTable();
        try {
          await table.add(records);
        } catch (e: any) {
          if (e.message?.includes('sourceMtime')) {
            console.warn(`\n⚠️  Schema mismatch in palace. Upgrading storage...`);
            this.table = null;
            this.tablePromise = null;
            await this.db!.dropTable(this.tableName);
            this.table = await this.db!.createTable(this.tableName, records);
            this.tablePromise = Promise.resolve(this.table);
          } else {
            throw e;
          }
        }
      }
    } catch (e: any) {
      console.error(`❌ Database upsert failed: ${e.message}`);
      throw e;
    }
  }

  public async search(
    query: string, 
    limit: number = 5,
    filter?: { wing?: string, room?: string }
  ): Promise<(Drawer & { similarity: number })[]> {
    if (!this.db) await this.init();
    const tableNames = await this.db!.tableNames();
    if (!tableNames.includes(this.tableName)) return [];

    const table = await this.getTable();
    const queryVector = await this.getEmbedding(query);
    let searchBuilder = table.search(queryVector).limit(limit);
    
    if (filter?.wing) searchBuilder = searchBuilder.where(`wing = '${filter.wing.replace(/'/g, "''")}'`);
    if (filter?.room) searchBuilder = searchBuilder.where(`room = '${filter.room.replace(/'/g, "''")}'`);
    
    const results = await searchBuilder.toArray();
    return results.map(r => {
      const dist = (r as any)._distance || 0;
      const similarity = 1 - (dist * dist) / 2;
      return { ...r, similarity: parseFloat(similarity.toFixed(3)) } as Drawer & { similarity: number };
    });
  }

  public async getTaxonomy(): Promise<{ wings: Record<string, number>, rooms: Record<string, number>, total: number }> {
    if (!this.db) await this.init();
    const tableNames = await this.db!.tableNames();
    if (!tableNames.includes(this.tableName)) return { wings: {}, rooms: {}, total: 0 };

    const table = await this.getTable();
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
    if (!this.db) await this.init();
    const tableNames = await this.db!.tableNames();
    if (!tableNames.includes(this.tableName)) return [];

    const table = await this.getTable();
    return await table.query().select(columns).toArray();
  }

  public async listDrawers(
    limit: number = 10,
    filter?: { wing?: string, room?: string }
  ): Promise<Drawer[]> {
    if (!this.db) await this.init();
    const tableNames = await this.db!.tableNames();
    if (!tableNames.includes(this.tableName)) return [];

    const table = await this.getTable();
    let query = table.query();
    if (filter?.wing) query = query.where(`wing = '${filter.wing.replace(/'/g, "''")}'`);
    if (filter?.room) query = query.where(`room = '${filter.room.replace(/'/g, "''")}'`);
    
    const results = await query.limit(limit).toArray();
    return results as any[];
  }

  public async clearTable(): Promise<void> {
    if (!this.db) await this.init();
    const tableNames = await this.db!.tableNames();
    if (tableNames.includes(this.tableName)) {
      this.table = null;
      this.tablePromise = null;
      await this.db!.dropTable(this.tableName);
    }
  }

  public async deleteDrawer(id: string): Promise<void> {
    if (!this.db) await this.init();
    const tableNames = await this.db!.tableNames();
    if (!tableNames.includes(this.tableName)) return;

    const table = await this.getTable();
    await table.delete(`id = '${id.replace(/'/g, "''")}'`);
  }

  public async getFileMtime(sourceFile: string): Promise<number | null> {
    if (!this.db) await this.init();
    const tableNames = await this.db!.tableNames();
    if (!tableNames.includes(this.tableName)) return null;

    const table = await this.getTable();
    try {
      const results = await table.query()
        .where(`sourceFile = '${sourceFile.replace(/'/g, "''")}'`)
        .limit(1).select(['sourceMtime']).toArray();
      if (results.length > 0) return (results[0] as any).sourceMtime || null;
    } catch (e: any) {
      if (e.message?.includes('sourceMtime')) return null;
      throw e;
    }
    return null;
  }

  public async getMtimeMap(wing?: string): Promise<Map<string, number>> {
    if (!this.db) await this.init();
    const tableNames = await this.db!.tableNames();
    if (!tableNames.includes(this.tableName)) return new Map();

    const table = await this.getTable();
    try {
      let query = table.query().select(['sourceFile', 'sourceMtime']);
      if (wing) query = query.where(`wing = '${wing.replace(/'/g, "''")}'`);
      const results = await query.toArray();
      const map = new Map<string, number>();
      for (const row of results) {
        const file = (row as any).sourceFile;
        const mtime = (row as any).sourceMtime;
        if (file && mtime !== undefined) map.set(file, mtime);
      }
      return map;
    } catch (e: any) {
      if (e.message?.includes('sourceMtime')) return new Map();
      throw e;
    }
  }

  public async close() {
    if (this.coalesceTimeout) {
      clearTimeout(this.coalesceTimeout);
      this.coalesceTimeout = null;
    }
  }

  public static async shutdown() {
    if (VectorStorage.globalWorker) {
      await VectorStorage.globalWorker.terminate();
      VectorStorage.globalWorker = null;
      VectorStorage.workerPromise = null;
    }
  }
}
