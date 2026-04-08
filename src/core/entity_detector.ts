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

// Optimization: Pre-compile regexes for protection/scoring
// We replace {name} with a capture group for the candidate
function getContextRegexes(patterns: string[], name: string): RegExp[] {
  return patterns.map(p => new RegExp(p.replace('{name}', name), 'i'));
}

export function detectEntities(content: string): Map<string, number> {
  const candidates = new Map<string, number>();
  
  // Pass 1: Capitalized words
  const words = content.match(/\b[A-Z][a-z]+\b/g) || [];
  
  for (const name of words) {
    if (name.length < 3) continue;
    
    const lower = name.toLowerCase();
    
    // If it's a stopword, check for protection before skipping
    if (STOPWORDS.has(lower)) {
        let protected_entity = false;
        
        // Check if it's protected by context (e.g. "Will said", "building the Flash")
        const pRegex = getContextRegexes([...PERSON_VERB_PATTERNS, ...PROJECT_VERB_PATTERNS], name);
        for (const regex of pRegex) {
            if (regex.test(content)) {
                protected_entity = true;
                break;
            }
        }
        
        if (!protected_entity) continue;
    }

    candidates.set(name, (candidates.get(name) || 0) + 1);
  }
  
  // Pass 2: Scoring and classification boost
  for (const [name, count] of candidates.entries()) {
    let score = count;
    
    // Detailed scoring
    const personPatterns = getContextRegexes(PERSON_VERB_PATTERNS, name);
    for (const regex of personPatterns) {
      if (regex.test(content)) score += 2; // High confidence boost
    }
    
    const projectPatterns = getContextRegexes(PROJECT_VERB_PATTERNS, name);
    for (const regex of projectPatterns) {
      if (regex.test(content)) score += 2;
    }
    
    candidates.set(name, score);
  }
  
  return candidates;
}
