import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { COMMON_ENGLISH_WORDS, PERSON_VERB_PATTERNS } from './entity_detector_constants';
import { EntityType } from './types';

export interface RegistryEntity {
  name: string;
  type: EntityType;
  confidence: number;
  source: 'onboarding' | 'learned' | 'wiki' | 'inferred';
  relationship?: string;
  aliases?: string[];
  canonical?: string;
  contexts?: string[];
}

export interface WikiCacheEntry {
    word: string;
    inferred_type: EntityType;
    confidence: number;
    wiki_summary?: string;
    wiki_title?: string;
    confirmed: boolean;
}

export interface RegistryData {
  version: number;
  mode: 'work' | 'personal' | 'combo';
  people: Record<string, RegistryEntity>;
  projects: string[];
  ambiguous_flags: string[];
  wiki_cache: Record<string, WikiCacheEntry>;
}

export class EntityRegistry {
  private data: RegistryData;
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(os.homedir(), '.mempalace', 'entity_registry.json');
    this.data = this.load();
  }

  private load(): RegistryData {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      } catch (e) {
        // Fallback to empty
      }
    }
    return {
      version: 1,
      mode: 'personal',
      people: {},
      projects: [],
      ambiguous_flags: [],
      wiki_cache: {}
    };
  }

  public save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  public seed(mode: 'work' | 'personal' | 'combo', people: RegistryEntity[], projects: string[]) {
    this.data.mode = mode;
    this.data.projects = projects;
    
    for (const p of people) {
      this.data.people[p.name] = p;
      if (COMMON_ENGLISH_WORDS.has(p.name.toLowerCase())) {
          if (!this.data.ambiguous_flags.includes(p.name.toLowerCase())) {
              this.data.ambiguous_flags.push(p.name.toLowerCase());
          }
      }
    }
    this.save();
  }

  public lookup(word: string, context: string = ''): Partial<RegistryEntity> & { needs_disambiguation: boolean } {
    const lower = word.toLowerCase();

    // 1. Check people
    for (const [name, info] of Object.entries(this.data.people)) {
        if (lower === name.toLowerCase() || (info.aliases && info.aliases.some(a => a.toLowerCase() === lower))) {
            if (this.data.ambiguous_flags.includes(lower) && context) {
                // Disambiguate logic here if needed
            }
            return { ...info, needs_disambiguation: false };
        }
    }

    // 2. Check projects
    if (this.data.projects.some(p => p.toLowerCase() === lower)) {
        return {
            name: word,
            type: 'project',
            confidence: 1.0,
            source: 'onboarding',
            needs_disambiguation: false
        };
    }

    // 3. Wiki cache
    if (this.data.wiki_cache[lower] && this.data.wiki_cache[lower].confirmed) {
        return {
            name: word,
            type: this.data.wiki_cache[lower].inferred_type,
            confidence: this.data.wiki_cache[lower].confidence,
            source: 'wiki',
            needs_disambiguation: false
        };
    }

    return {
        name: word,
        type: 'unknown',
        confidence: 0,
        source: 'inferred',
        needs_disambiguation: false
    };
  }

  public async research(word: string): Promise<WikiCacheEntry> {
      const lower = word.toLowerCase();
      if (this.data.wiki_cache[lower]) return this.data.wiki_cache[lower];

      // Minimal Node-native Wikipedia summary fetch
      // In a real environment, we'd use a robust fetch, but keeping it simple for the port
      try {
          const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`;
          const response = await fetch(url, { headers: { 'User-Agent': 'MemPalace/1.0' } });
          if (response.status === 200) {
              const result = await response.json();
              const extract = (result.extract || '').toLowerCase();
              
              let type: EntityType = 'concept';
              if (extract.includes('name') || extract.includes('given name')) type = 'person';
              else if (extract.includes('city') || extract.includes('country')) type = 'place';

              const entry: WikiCacheEntry = {
                  word,
                  inferred_type: type,
                  confidence: 0.8,
                  wiki_summary: result.extract,
                  wiki_title: result.title,
                  confirmed: false
              };
              this.data.wiki_cache[lower] = entry;
              this.save();
              return entry;
          }
      } catch (e) {
          // Ignore
      }

      const unknownEntry: WikiCacheEntry = {
          word,
          inferred_type: 'unknown',
          confidence: 0,
          confirmed: false
      };
      return unknownEntry;
  }

  public getSummary(): string {
      return `Mode: ${this.data.mode}, People: ${Object.keys(this.data.people).length}, Projects: ${this.data.projects.length}`;
  }

  public getPeople(): RegistryEntity[] {
      return Object.values(this.data.people);
  }

  public getProjects(): string[] {
      return this.data.projects;
  }
}
