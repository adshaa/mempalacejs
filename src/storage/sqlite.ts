import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { Entity, Triple } from '../core/types';

export class KnowledgeGraph {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath, { timeout: 10000 });
    this.db.pragma('journal_mode = WAL');
    this.initDb();
  }

  private initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT DEFAULT 'unknown',
          properties TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS triples (
          id TEXT PRIMARY KEY,
          subject TEXT NOT NULL,
          predicate TEXT NOT NULL,
          object TEXT NOT NULL,
          valid_from TEXT,
          valid_to TEXT,
          confidence REAL DEFAULT 1.0,
          source_closet TEXT,
          source_file TEXT,
          extracted_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (subject) REFERENCES entities(id),
          FOREIGN KEY (object) REFERENCES entities(id)
      );

      CREATE INDEX IF NOT EXISTS idx_triples_subject ON triples(subject);
      CREATE INDEX IF NOT EXISTS idx_triples_object ON triples(object);
      CREATE INDEX IF NOT EXISTS idx_triples_predicate ON triples(predicate);
      CREATE INDEX IF NOT EXISTS idx_triples_valid ON triples(valid_from, valid_to);
    `);
  }

  private entityId(name: string): string {
    return name.toLowerCase().replace(/ /g, '_').replace(/'/g, '');
  }

  /**
   * Write Operations
   */
  public addEntity(name: string, entityType: string = 'unknown', properties: Record<string, any> = {}): string {
    const eid = this.entityId(name);
    const props = JSON.stringify(properties);
    const stmt = this.db.prepare(`
      INSERT INTO entities (id, name, type, properties) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
        name=excluded.name, 
        type=excluded.type, 
        properties=excluded.properties
    `);
    stmt.run(eid, name, entityType, props);
    return eid;
  }

  public addTriple(triple: Triple): string {
    return this.addTriplesBatch([triple])[0];
  }

  /**
   * Batch Write Operations (Optimized)
   */
  public addTriplesBatch(triples: Triple[]): string[] {
    const ids: string[] = [];
    
    const insertEntity = this.db.prepare(`INSERT OR IGNORE INTO entities (id, name) VALUES (?, ?)`);
    const existingStmt = this.db.prepare(`
      SELECT id FROM triples 
      WHERE subject=? AND predicate=? AND object=? AND valid_to IS NULL
    `);
    const insertTriple = this.db.prepare(`
      INSERT INTO triples (id, subject, predicate, object, valid_from, valid_to, confidence, source_closet, source_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((data: Triple[]) => {
      for (const triple of data) {
        const subId = this.entityId(triple.subject);
        const objId = this.entityId(triple.object);
        const pred = triple.predicate.toLowerCase().replace(/ /g, '_');

        // 1. Ensure entities exist
        insertEntity.run(subId, triple.subject);
        insertEntity.run(objId, triple.object);

        // 2. Check for existing identical active triple
        const existing = existingStmt.get(subId, pred, objId) as { id: string } | undefined;
        if (existing) {
          ids.push(existing.id);
          continue;
        }

        // 3. Create new triple
        const timestampStr = triple.validFrom || new Date().toISOString();
        const hash = crypto.randomBytes(4).toString('hex');
        const tripleId = `t_${subId}_${pred}_${objId}_${hash}`;

        insertTriple.run(
          tripleId,
          subId,
          pred,
          objId,
          triple.validFrom || null,
          triple.validTo || null,
          triple.confidence || 1.0,
          triple.sourceCloset || null,
          triple.sourceFile || null
        );
        ids.push(tripleId);
      }
    });

    transaction(triples);
    return ids;
  }

  public invalidate(subject: string, predicate: string, object: string, ended?: string): void {
    const subId = this.entityId(subject);
    const objId = this.entityId(object);
    const pred = predicate.toLowerCase().replace(/ /g, '_');
    const endDate = ended || new Date().toISOString().split('T')[0];

    const stmt = this.db.prepare(`
      UPDATE triples SET valid_to=? 
      WHERE subject=? AND predicate=? AND object=? AND valid_to IS NULL
    `);
    stmt.run(endDate, subId, pred, objId);
  }

  /**
   * Query Operations
   */
  public queryEntity(name: string, asOf?: string, direction: 'outgoing' | 'incoming' | 'both' = 'outgoing'): Triple[] {
    const eid = this.entityId(name);
    const results: Triple[] = [];

    if (direction === 'outgoing' || direction === 'both') {
      let query = `
        SELECT t.*, e.name as obj_name 
        FROM triples t 
        JOIN entities e ON t.object = e.id 
        WHERE t.subject = ?
      `;
      const params: any[] = [eid];
      if (asOf) {
        query += ` AND (t.valid_from IS NULL OR t.valid_from <= ?) AND (t.valid_to IS NULL OR t.valid_to >= ?)`;
        params.push(asOf, asOf);
      }
      
      const rows = this.db.prepare(query).all(...params) as any[];
      for (const row of rows) {
        results.push({
          subject: name,
          predicate: row.predicate,
          object: row.obj_name,
          validFrom: row.valid_from,
          validTo: row.valid_to,
          confidence: row.confidence,
          sourceCloset: row.source_closet,
          current: row.valid_to === null
        });
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      let query = `
        SELECT t.*, e.name as sub_name 
        FROM triples t 
        JOIN entities e ON t.subject = e.id 
        WHERE t.object = ?
      `;
      const params: any[] = [eid];
      if (asOf) {
        query += ` AND (t.valid_from IS NULL OR t.valid_from <= ?) AND (t.valid_to IS NULL OR t.valid_to >= ?)`;
        params.push(asOf, asOf);
      }
      
      const rows = this.db.prepare(query).all(...params) as any[];
      for (const row of rows) {
        results.push({
          subject: row.sub_name,
          predicate: row.predicate,
          object: name,
          validFrom: row.valid_from,
          validTo: row.valid_to,
          confidence: row.confidence,
          sourceCloset: row.source_closet,
          current: row.valid_to === null
        });
      }
    }

    return results;
  }

  public timeline(entityName?: string): Triple[] {
    let query = '';
    const params: any[] = [];
    
    if (entityName) {
      const eid = this.entityId(entityName);
      query = `
        SELECT t.*, s.name as sub_name, o.name as obj_name
        FROM triples t
        JOIN entities s ON t.subject = s.id
        JOIN entities o ON t.object = o.id
        WHERE (t.subject = ? OR t.object = ?)
        ORDER BY t.valid_from ASC
        LIMIT 100
      `;
      params.push(eid, eid);
    } else {
      query = `
        SELECT t.*, s.name as sub_name, o.name as obj_name
        FROM triples t
        JOIN entities s ON t.subject = s.id
        JOIN entities o ON t.object = o.id
        ORDER BY t.valid_from ASC
        LIMIT 100
      `;
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => ({
      subject: r.sub_name,
      predicate: r.predicate,
      object: r.obj_name,
      validFrom: r.valid_from,
      validTo: r.valid_to,
      current: r.valid_to === null
    }));
  }

  public stats() {
    const entities = (this.db.prepare("SELECT COUNT(*) as c FROM entities").get() as any).c;
    const triples = (this.db.prepare("SELECT COUNT(*) as c FROM triples").get() as any).c;
    const current = (this.db.prepare("SELECT COUNT(*) as c FROM triples WHERE valid_to IS NULL").get() as any).c;
    const expired = triples - current;
    const predicatesRows = this.db.prepare("SELECT DISTINCT predicate FROM triples ORDER BY predicate").all() as any[];
    
    return {
      entities,
      triples,
      currentFacts: current,
      expiredFacts: expired,
      relationshipTypes: predicatesRows.map(r => r.predicate)
    };
  }
}
