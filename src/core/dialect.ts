import * as path from 'path';
import { EMOTION_SIGNALS, FLAG_SIGNALS, STOP_WORDS, EMOTION_CODES } from './dialect_constants';

export interface DialectMetadata {
  source_file?: string;
  wing?: string;
  room?: string;
  date?: string;
}

export class Dialect {
  private entityCodes: Record<string, string> = {};
  private skipNames: string[] = [];

  constructor(entities: Record<string, string> = {}, skipNames: string[] = []) {
    for (const [name, code] of Object.entries(entities)) {
      this.entityCodes[name] = code;
      this.entityCodes[name.toLowerCase()] = code;
    }
    this.skipNames = skipNames.map(n => n.toLowerCase());
  }

  public encodeEntity(name: string): string | null {
    const nameLower = name.toLowerCase();
    if (this.skipNames.some(s => nameLower.includes(s))) return null;
    if (this.entityCodes[name]) return this.entityCodes[name];
    if (this.entityCodes[nameLower]) return this.entityCodes[nameLower];
    
    for (const [key, code] of Object.entries(this.entityCodes)) {
      if (nameLower.includes(key.toLowerCase())) return code;
    }
    
    return name.substring(0, 3).toUpperCase();
  }

  public encodeEmotions(emotions: string[]): string {
    const codes: string[] = [];
    for (const e of emotions) {
      const code = (EMOTION_CODES as any)[e] || e.substring(0, 4);
      if (!codes.includes(code)) codes.push(code);
    }
    return codes.slice(0, 3).join('+');
  }

  public detectEmotions(text: string): string[] {
    const textLower = text.toLowerCase();
    const detected: string[] = [];
    const seen = new Set<string>();
    
    for (const [keyword, code] of Object.entries(EMOTION_SIGNALS)) {
      if (textLower.includes(keyword) && !seen.has(code)) {
        detected.push(code);
        seen.add(code);
      }
    }
    return detected.slice(0, 3);
  }

  public detectFlags(text: string): string[] {
    const textLower = text.toLowerCase();
    const detected: string[] = [];
    const seen = new Set<string>();
    
    for (const [keyword, flag] of Object.entries(FLAG_SIGNALS)) {
      if (textLower.includes(keyword) && !seen.has(flag)) {
        detected.push(flag);
        seen.add(flag);
      }
    }
    return detected.slice(0, 3);
  }

  public extractTopics(text: string, maxTopics: number = 3): string[] {
    const words = text.match(/[a-zA-Z][a-zA-Z_-]{2,}/g) || [];
    const freq: Record<string, number> = {};
    
    for (const w of words) {
      const wLower = w.toLowerCase();
      if (STOP_WORDS.has(wLower) || wLower.length < 3) continue;
      freq[wLower] = (freq[wLower] || 0) + 1;
    }
    
    for (const w of words) {
      const wLower = w.toLowerCase();
      if (STOP_WORDS.has(wLower)) continue;
      if (w[0] === w[0].toUpperCase() && freq[wLower]) freq[wLower] += 2;
      if (w.includes('_') || w.includes('-') || (w.length > 1 && /[A-Z]/.test(w.substring(1)))) {
        if (freq[wLower]) freq[wLower] += 2;
      }
    }
    
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTopics)
      .map(e => e[0]);
  }

  public extractKeySentence(text: string): string {
    const sentences = text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 10);
    if (sentences.length === 0) return "";
    
    const decisionWords = new Set([
      "decided", "because", "instead", "prefer", "switched", "chose", "realized",
      "important", "key", "critical", "discovered", "learned", "conclusion",
      "solution", "reason", "why", "breakthrough", "insight"
    ]);
    
    const scored = sentences.map(s => {
      let score = 0;
      const sLower = s.toLowerCase();
      for (const w of decisionWords) {
        if (sLower.includes(w)) score += 2;
      }
      if (s.length < 80) score += 1;
      if (s.length < 40) score += 1;
      if (s.length > 150) score -= 2;
      return { score, s };
    });
    
    scored.sort((a, b) => b.score - a.score);
    let best = scored[0].s;
    if (best.length > 55) best = best.substring(0, 52) + "...";
    return best;
  }

  public detectEntitiesInText(text: string): string[] {
    const found: string[] = [];
    for (const [name, code] of Object.entries(this.entityCodes)) {
      if (name !== name.toLowerCase() && text.toLowerCase().includes(name.toLowerCase())) {
        if (!found.includes(code)) found.push(code);
      }
    }
    if (found.length > 0) return found;
    
    const words = text.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const clean = words[i].replace(/[^a-zA-Z]/g, '');
      if (clean.length >= 2 && /^[A-Z][a-z]+$/.test(clean) && !STOP_WORDS.has(clean.toLowerCase())) {
        const code = clean.substring(0, 3).toUpperCase();
        if (!found.includes(code)) found.push(code);
        if (found.length >= 3) break;
      }
    }
    return found;
  }

  public compress(text: string, metadata: DialectMetadata = {}): string {
    const entities = this.detectEntitiesInText(text);
    const entityStr = entities.length > 0 ? entities.slice(0, 3).join('+') : "???";
    
    const topics = this.extractTopics(text);
    const topicStr = topics.length > 0 ? topics.slice(0, 3).join('_') : "misc";
    
    const quote = this.extractKeySentence(text);
    const quotePart = quote ? `"${quote}"` : "";
    
    const emotions = this.detectEmotions(text);
    const emotionStr = emotions.join('+');
    
    const flags = this.detectFlags(text);
    const flagStr = flags.join('+');
    
    const lines: string[] = [];
    if (metadata.source_file || metadata.wing) {
      const headerParts = [
        metadata.wing || "?",
        metadata.room || "?",
        metadata.date || "?",
        metadata.source_file ? path.parse(metadata.source_file).name : "?"
      ];
      lines.push(headerParts.join('|'));
    }
    
    const parts = [`0:${entityStr}`, topicStr];
    if (quotePart) parts.push(quotePart);
    if (emotionStr) parts.push(emotionStr);
    if (flagStr) parts.push(flagStr);
    
    lines.push(parts.join('|'));
    return lines.join('\n');
  }

  public decode(dialectText: string): any {
    const lines = dialectText.trim().split('\n');
    const result: any = { header: {}, arc: "", zettels: [], tunnels: [] };
    
    for (const line of lines) {
      if (line.startsWith('ARC:')) {
        result.arc = line.substring(4);
      } else if (line.startsWith('T:')) {
        result.tunnels.push(line);
      } else if (line.includes('|') && line.split('|')[0].includes(':')) {
        result.zettels.push(line);
      } else if (line.includes('|')) {
        const parts = line.split('|');
        result.header = {
          file: parts[0] || "",
          entities: parts[1] || "",
          date: parts[2] || "",
          title: parts[3] || ""
        };
      }
    }
    return result;
  }

  public static countTokens(text: string): number {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    return Math.max(1, Math.floor(words.length * 1.3));
  }

  public compressionStats(originalText: string, compressed: string): any {
    const origTokens = Dialect.countTokens(originalText);
    const compTokens = Dialect.countTokens(compressed);
    return {
      original_tokens_est: origTokens,
      summary_tokens_est: compTokens,
      size_ratio: parseFloat((origTokens / Math.max(compTokens, 1)).toFixed(1)),
      original_chars: originalText.length,
      summary_chars: compressed.length
    };
  }

  public encodeZettel(zettel: any): string {
    const zid = zettel.id.split("-").pop();
    
    let entityCodes = (zettel.people || []).map((p: string) => this.encodeEntity(p)).filter((e: any) => e !== null);
    if (entityCodes.length === 0) entityCodes = ["???"];
    const entities = Array.from(new Set(entityCodes)).sort().join('+');
    
    const topics = zettel.topics || [];
    const topicStr = topics.length > 0 ? topics.slice(0, 2).join('_') : "misc";
    
    const emotions = this.encodeEmotions(zettel.emotional_tone || []);
    
    const parts = [`${zid}:${entities}`, topicStr];
    parts.push(`"test quote"`); // Placeholder for compatibility
    parts.push(`0.5`); // Placeholder for weight
    if (emotions) parts.push(emotions);
    
    return parts.join('|');
  }

  public encodeTunnel(tunnel: any): string {
    const fromId = tunnel.from.split("-").pop();
    const toId = tunnel.to.split("-").pop();
    const label = tunnel.label || "";
    const shortLabel = label.includes(':') ? label.split(':')[0] : label.substring(0, 30);
    return `T:${fromId}<->${toId}|${shortLabel}`;
  }
}

export function compressToAaak(text: string): string {
  const d = new Dialect();
  return d.compress(text);
}
