import { EMOTION_SIGNALS, FLAG_SIGNALS, STOP_WORDS } from './dialect_constants';

/**
 * AAAK Dialect Compression
 * Compressed memory dialect for efficient LLM context loading.
 */

export function compressToAaak(text: string): string {
  // Simple abbreviation heuristic
  let compressed = text;

  // 1. Remove stopwords
  for (const word of STOP_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    compressed = compressed.replace(regex, '');
  }

  // 2. Map known emotion signals
  for (const [key, signals] of Object.entries(EMOTION_SIGNALS)) {
    for (const signal of signals) {
      const regex = new RegExp(`\\b${signal}\\b`, 'gi');
      compressed = compressed.replace(regex, `*${key}*`);
    }
  }

  // 3. Simple truncation
  return compressed.replace(/\s+/g, ' ').trim().substring(0, 200);
}
