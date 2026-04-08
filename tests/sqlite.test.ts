import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KnowledgeGraph } from '../src/storage/sqlite';
import * as fs from 'fs';
import * as path from 'path';

describe('KnowledgeGraph', () => {
  const dbPath = path.join(__dirname, 'test_kg.sqlite3');
  let kg: KnowledgeGraph;

  beforeEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    kg = new KnowledgeGraph(dbPath);
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('should add entities and triples', () => {
    kg.addEntity('Max', 'person');
    kg.addTriple({
      subject: 'Max',
      predicate: 'loves',
      object: 'chess',
      validFrom: '2026-01-01'
    });

    const results = kg.queryEntity('Max', undefined, 'outgoing');
    expect(results).toHaveLength(1);
    expect(results[0].object).toBe('chess');
    expect(results[0].current).toBe(true);

    const stats = kg.stats();
    expect(stats.entities).toBe(2); // Max and chess (auto-created)
    expect(stats.triples).toBe(1);
  });

  it('should invalidate triples', () => {
    kg.addTriple({
      subject: 'Alice',
      predicate: 'works_on',
      object: 'MemPalace',
      validFrom: '2025-01-01'
    });
    
    kg.invalidate('Alice', 'works_on', 'MemPalace', '2026-04-01');

    const results = kg.queryEntity('Alice');
    expect(results).toHaveLength(1);
    expect(results[0].current).toBe(false);
    expect(results[0].validTo).toBe('2026-04-01');
  });
});
