import { describe, it, expect } from 'vitest';
import { extractMemories } from '../src/core/general_extractor';

describe('general_extractor', () => {
  it('should extract decision memories', () => {
    const text = 'We decided to use LanceDB for our vector storage because it is fast.';
    const memories = extractMemories(text);
    expect(memories).toHaveLength(1);
    expect(memories[0].memoryType).toBe('decision');
    expect(memories[0].content).toContain('decided to use LanceDB');
  });

  it('should extract preference memories', () => {
    const text = 'I prefer using TypeScript over JavaScript for better type safety.';
    const memories = extractMemories(text);
    expect(memories).toHaveLength(1);
    expect(memories[0].memoryType).toBe('preference');
    expect(memories[0].content).toContain('prefer using TypeScript');
  });

  it('should extract milestone memories', () => {
    const text = 'We reached the v0.1 milestone today after finishing the miner.';
    const memories = extractMemories(text);
    expect(memories).toHaveLength(1);
    expect(memories[0].memoryType).toBe('milestone');
    expect(memories[0].content).toContain('reached the v0.1 milestone');
  });

  it('should extract problem memories', () => {
    const text = 'We have a major problem in the embedding generation process.';
    const memories = extractMemories(text);
    expect(memories).toHaveLength(1);
    expect(memories[0].memoryType).toBe('problem');
    expect(memories[0].content).toContain('major problem');
  });

  it('should extract emotional memories', () => {
    const text = 'I love how fast the search is now!';
    const memories = extractMemories(text);
    expect(memories).toHaveLength(1);
    expect(memories[0].memoryType).toBe('emotional');
    expect(memories[0].content).toContain('I love');
  });

  it('should handle multiple memories in different paragraphs', () => {
    const text = 'We decided to use Vitest.\n\nI love how fast it is!';
    const memories = extractMemories(text);
    expect(memories).toHaveLength(2);
    expect(memories[0].memoryType).toBe('decision');
    expect(memories[1].memoryType).toBe('emotional');
  });

  it('should return empty array for text with no markers', () => {
    const text = 'Just some random text about nothing in particular.';
    const memories = extractMemories(text);
    expect(memories).toHaveLength(0);
  });
});
