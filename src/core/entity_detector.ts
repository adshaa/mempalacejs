import { PERSON_VERB_PATTERNS, PROJECT_VERB_PATTERNS } from './entity_detector_constants';

export type EntityType = 'person' | 'project' | 'unknown';

export interface EntityCandidate {
  name: string;
  type: EntityType;
  score: number;
}

export function detectEntities(content: string): Map<string, number> {
  const candidates = new Map<string, number>();
  
  // Very simplistic implementation of the two-pass detector
  // Pass 1: Simple regex scan for potential names/entities
  const potentialEntities = content.match(/[A-Z][a-z]+/g) || [];
  
  for (const name of potentialEntities) {
    if (name.length < 3) continue;
    candidates.set(name, (candidates.get(name) || 0) + 1);
  }
  
  return candidates;
}
