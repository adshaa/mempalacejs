import { describe, it, expect } from 'vitest';
import { detectEntities } from '../src/core/entity_detector';

describe('entity_detector', () => {
  it('should detect capitalized names as potential entities', () => {
    const text = 'Alice and Bob are working on the Orion project.';
    const entities = detectEntities(text);
    
    expect(entities.has('Alice')).toBe(true);
    expect(entities.has('Bob')).toBe(true);
    expect(entities.has('Orion')).toBe(true);
  });

  it('should give higher scores to entities in known context', () => {
    // "Alice said" matches a PERSON_VERB_PATTERN
    const text = 'Alice said that the project is almost done.';
    const entities = detectEntities(text);
    
    expect(entities.has('Alice')).toBe(true);
    const score = entities.get('Alice') || 0;
    expect(score).toBeGreaterThan(1);
  });

  it('should skip common stopwords unless protected by context', () => {
    const text = 'The and But are common words. Will is a name here because Will said so.';
    const entities = detectEntities(text);
    
    expect(entities.has('The')).toBe(false);
    expect(entities.has('And')).toBe(false);
    expect(entities.has('Will')).toBe(true);
    expect(entities.get('Will')).toBeGreaterThan(1);
  });

  it('should handle empty or low-value text', () => {
    expect(detectEntities('')).toBeDefined();
    expect(detectEntities('no entities here').size).toBe(0);
  });
});
