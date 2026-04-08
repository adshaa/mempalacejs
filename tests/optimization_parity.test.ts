import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VectorStorage } from '../src/storage/vector';
import { normalize, normalizeContent } from '../src/core/normalize';
import { detectEntities } from '../src/core/entity_detector';
import { KnowledgeGraph } from '../src/storage/sqlite';
import * as path from 'path';
import * as fs from 'fs';

describe('Optimization Parity Baseline', () => {
  const dbDir = path.join(__dirname, 'test_data');
  const vectorDbPath = path.join(dbDir, 'parity_vector');
  const sqlitePath = path.join(dbDir, 'parity_kg.db');
  
  const storage = new VectorStorage(vectorDbPath, 'parity_table');
  const kg = new KnowledgeGraph(sqlitePath);

  beforeAll(async () => {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    await storage.init();
  });

  afterAll(async () => {
    await storage.close();
    // Clean up
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('Vector Parity: Should generate consistent embeddings via Worker', async () => {
    const testString = 'The quick brown fox jumps over the lazy dog';
    const embedding = await storage.getEmbedding(testString);
    
    expect(embedding).toBeDefined();
    expect(embedding.length).toBe(384); 
  });

  it('Normalization Parity: Should match file and content normalization', () => {
    const sampleData = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
      ]
    };
    const jsonStr = JSON.stringify(sampleData);
    const jsonPath = path.join(dbDir, 'sample.json');
    fs.writeFileSync(jsonPath, jsonStr);

    const fromFile = normalize(jsonPath);
    const fromContent = normalizeContent(jsonStr, '.json');
    
    expect(fromFile).toBe(fromContent);
    expect(fromFile).toContain('> Hello');
    
    fs.unlinkSync(jsonPath);
  });

  it('Entity Parity: Optimized behavior (Contextual Protection)', () => {
    const content = 'Will decided to start the project. We are building the Star architecture.';
    const entities = detectEntities(content);
    
    expect(entities.has('Will')).toBe(true); 
    expect(entities.has('Star')).toBe(true);
    
    const noisyContent = 'The project is finished.';
    const noisyEntities = detectEntities(noisyContent);
    expect(noisyEntities.has('The')).toBe(false); 
  });

  it('SQLite Parity: Batching should be consistent', () => {
    const triples = [
      { subject: 'Alice', predicate: 'knows', object: 'Bob' },
      { subject: 'Bob', predicate: 'works_on', object: 'Mempalace' }
    ];
    
    const ids = kg.addTriplesBatch(triples);
    expect(ids.length).toBe(2);
    
    const stats = kg.stats();
    expect(stats.entities).toBe(3); // Alice, Bob, Mempalace
    expect(stats.triples).toBe(2);
  });
});
