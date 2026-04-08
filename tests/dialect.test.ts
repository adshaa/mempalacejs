import { describe, it, expect } from 'vitest';
import { Dialect } from '../src/core/dialect';

describe('Dialect', () => {
  it('should compress basic text', () => {
    const d = new Dialect();
    const result = d.compress("We decided to use GraphQL instead of REST for the API layer.");
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('|');
  });

  it('should compress with metadata', () => {
    const d = new Dialect();
    const result = d.compress(
      "Authentication now uses JWT tokens.",
      { wing: "project", room: "backend", source_file: "auth.py" }
    );
    expect(result).toContain('project');
    expect(result).toContain('backend');
  });

  it('should produce entity codes', () => {
    const d = new Dialect({ "Alice": "ALC", "Bob": "BOB" });
    const result = d.compress("Alice told Bob about the new deployment strategy.");
    expect(result).toMatch(/ALC|BOB/);
  });

  it('should detect known entities', () => {
    const d = new Dialect({ "Alice": "ALC" });
    const found = (d as any).detectEntitiesInText("Alice went to the store.");
    expect(found).toContain('ALC');
  });

  it('should detect emotions', () => {
    const d = new Dialect();
    const emotions = (d as any).detectEmotions("I'm really excited and happy about this breakthrough!");
    expect(emotions.length).toBeGreaterThan(0);
  });

  it('should extract topics', () => {
    const d = new Dialect();
    const topics = (d as any).extractTopics(
      "The Python authentication server uses PostgreSQL for storage and Redis for caching sessions."
    );
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.length).toBeLessThanOrEqual(3);
  });

  it('should extract key sentence', () => {
    const d = new Dialect();
    const text = (
      "The server runs on port 3000. " +
      "We decided to use PostgreSQL instead of MongoDB. " +
      "The config file needs updating."
    );
    const key = (d as any).extractKeySentence(text);
    const keyLower = key.toLowerCase();
    expect(keyLower.includes('decided') || keyLower.includes('instead')).toBe(true);
  });

  it('should calculate compression stats', () => {
    const d = new Dialect();
    const original = "We decided to use GraphQL instead of REST. ".repeat(10);
    const compressed = d.compress(original);
    const stats = d.compressionStats(original, compressed);
    expect(stats.size_ratio).toBeGreaterThan(1);
    expect(stats.original_chars).toBeGreaterThan(stats.summary_chars);
  });

  it('should decode roundtrip-ish', () => {
    const d = new Dialect();
    const encoded = '001|ALC+BOB|2025-01-01|test_title\nARC:journey\n0:ALC|memory_ai|"test quote"|joy';
    const decoded = d.decode(encoded);
    expect(decoded.header.file).toBe("001");
    expect(decoded.arc).toBe("journey");
    expect(decoded.zettels.length).toBe(1);
  });
});
