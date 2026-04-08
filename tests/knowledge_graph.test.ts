import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KnowledgeGraph } from '../src/storage/sqlite';
import * as fs from 'fs';
import * as path from 'path';

describe('KnowledgeGraph', () => {
  const dbPath = path.join(__dirname, 'test_kg_sophisticated.sqlite3');
  let kg: KnowledgeGraph;

  beforeEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    kg = new KnowledgeGraph(dbPath);
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  function seedKg(kg: KnowledgeGraph) {
    kg.addEntity("Alice", "person");
    kg.addEntity("Max", "person");
    kg.addTriple({ subject: "Alice", predicate: "parent_of", object: "Max", validFrom: "2020-01-01" });
    kg.addTriple({ subject: "Alice", predicate: "works_at", object: "Acme Corp", validFrom: "2010-01-01", validTo: "2024-01-01" });
    kg.addTriple({ subject: "Alice", predicate: "works_at", object: "NewCo", validFrom: "2024-01-02" });
    kg.addTriple({ subject: "Max", predicate: "does", object: "swimming", validFrom: "2025-01-01" });
    kg.addTriple({ subject: "Max", predicate: "does", object: "chess", validFrom: "2025-01-01" });
  }

  it('should normalize entity IDs', () => {
    const eid = kg.addEntity("Dr. Chen", "person");
    expect(eid).toBe("dr._chen");
  });

  it('should handle entity upsert', () => {
    kg.addEntity("Alice", "person");
    kg.addEntity("Alice", "engineer");
    const stats = kg.stats();
    expect(stats.entities).toBe(1);
  });

  it('should handle duplicate triples and return existing ID', () => {
    const tid1 = kg.addTriple({ subject: "Alice", predicate: "knows", object: "Bob" });
    const tid2 = kg.addTriple({ subject: "Alice", predicate: "knows", object: "Bob" });
    expect(tid1).toBe(tid2);
  });

  it('should allow re-adding after invalidation', () => {
    const tid1 = kg.addTriple({ subject: "Alice", predicate: "works_at", object: "Acme" });
    kg.invalidate("Alice", "works_at", "Acme", "2025-01-01");
    const tid2 = kg.addTriple({ subject: "Alice", predicate: "works_at", object: "Acme" });
    expect(tid1).not.toBe(tid2);
  });

  it('should query outgoing relationships', () => {
    seedKg(kg);
    const results = kg.queryEntity("Alice", undefined, "outgoing");
    const predicates = results.map(r => r.predicate);
    expect(predicates).toContain('parent_of');
    expect(predicates).toContain('works_at');
  });

  it('should query incoming relationships', () => {
    seedKg(kg);
    const results = kg.queryEntity("Max", undefined, "incoming");
    expect(results.some(r => r.subject === "Alice" && r.predicate === "parent_of")).toBe(true);
  });

  it('should filter by asOf date', () => {
    seedKg(kg);
    const results2023 = kg.queryEntity("Alice", "2023-06-01", "outgoing");
    const employers2023 = results2023.filter(r => r.predicate === 'works_at').map(r => r.object);
    expect(employers2023).toContain("Acme Corp");
    expect(employers2023).not.toContain("NewCo");

    const results2025 = kg.queryEntity("Alice", "2025-06-01", "outgoing");
    const employers2025 = results2025.filter(r => r.predicate === 'works_at').map(r => r.object);
    expect(employers2025).toContain("NewCo");
    expect(employers2025).not.toContain("Acme Corp");
  });

  it('should generate timeline', () => {
    seedKg(kg);
    const tl = kg.timeline();
    expect(tl.length).toBeGreaterThanOrEqual(4);
    
    const maxTl = kg.timeline("Max");
    expect(maxTl.some(t => t.subject === "Max" || t.object === "Max")).toBe(true);
  });

  it('should enforce timeline limit', () => {
    for (let i = 0; i < 105; i++) {
      kg.addTriple({ subject: `entity_${i}`, predicate: "relates_to", object: `entity_${i+1}` });
    }
    const tl = kg.timeline();
    expect(tl.length).toBe(100);
  });

  it('should return correct stats', () => {
    seedKg(kg);
    const stats = kg.stats();
    expect(stats.entities).toBeGreaterThanOrEqual(4);
    expect(stats.triples).toBe(5);
    expect(stats.currentFacts).toBe(4);
    expect(stats.expiredFacts).toBe(1);
  });
});
