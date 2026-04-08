import { 
  PERSON_VERB_PATTERNS, 
  PROJECT_VERB_PATTERNS, 
  STOPWORDS 
} from './entity_detector_constants';

export type EntityType = 'person' | 'project' | 'unknown';

export interface EntityCandidate {
  name: string;
  type: EntityType;
  score: number;
}

const personRegex = PERSON_VERB_PATTERNS.map(p => new RegExp(p, 'i'));
const projectRegex = PROJECT_VERB_PATTERNS.map(p => new RegExp(p, 'i'));

export function detectEntities(content: string): Map<string, number> {
  const candidates = new Map<string, number>();
  
  // Pass 1: Capitalized words
  const words = content.match(/\b[A-Z][a-z]+\b/g) || [];
  
  for (const name of words) {
    if (name.length < 3 || STOPWORDS.has(name.toLowerCase())) continue;
    candidates.set(name, (candidates.get(name) || 0) + 1);
  }
  
  // Pass 2: Scoring based on context (simplified)
  for (const [name, count] of candidates.entries()) {
    let score = count;
    
    // Check for nearby person verbs
    for (const regex of personRegex) {
      if (regex.test(content)) score += 1;
    }
    
    // Check for project keywords
    for (const regex of projectRegex) {
      if (regex.test(content)) score += 1;
    }
    
    candidates.set(name, score);
  }
  
  return candidates;
}
