import * as lancedb from '@lancedb/lancedb';
import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';
import { Drawer } from '../core/types';

export class VectorStorage {
  private dbPath: string;
  private tableName: string;
  private db: lancedb.Connection | null = null;
  private extractor: FeatureExtractionPipeline | null = null;

  constructor(dbPath: string, tableName: string) {
    this.dbPath = dbPath;
    this.tableName = tableName;
  }

  public async init() {
    if (!this.extractor) {
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    if (!this.db) {
      this.db = await lancedb.connect(this.dbPath);
    }
  }

  public async getEmbedding(text: string): Promise<number[]> {
    if (!this.extractor) await this.init();
    const output = await this.extractor!(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  public async upsertDrawer(drawer: Drawer): Promise<void> {
    if (!this.db) await this.init();
    if (!drawer.vector) {
      drawer.vector = await this.getEmbedding(drawer.content);
    }

    try {
      const tableNames = await this.db!.tableNames();
      const record = {
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
      };

      if (!tableNames.includes(this.tableName)) {
        await this.db!.createTable(this.tableName, [record]);
      } else {
        const table = await this.db!.openTable(this.tableName);
        await table.add([record]);
      }
    } catch (e) {
      console.error(`Failed to upsert drawer ${drawer.id}`, e);
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
      const dist = (r as any)._distance || 0;
      const similarity = 1 - (dist * dist) / 2;
      return {
        ...r,
        similarity: parseFloat(similarity.toFixed(3))
      } as any;
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
}
