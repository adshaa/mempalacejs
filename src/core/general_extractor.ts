import { 
  DECISION_MARKERS, PREFERENCE_MARKERS, MILESTONE_MARKERS, 
  PROBLEM_MARKERS, EMOTION_MARKERS 
} from './general_extractor_constants';
import { normalizeContent } from './normalize';

export interface ExtractedMemory {
  content: string;
  memoryType: 'decision' | 'preference' | 'milestone' | 'problem' | 'emotional';
  chunkIndex: number;
}

const decisionRegex = DECISION_MARKERS.map(p => new RegExp(p, 'i'));
const preferenceRegex = PREFERENCE_MARKERS.map(p => new RegExp(p, 'i'));
const milestoneRegex = MILESTONE_MARKERS.map(p => new RegExp(p, 'i'));
const problemRegex = PROBLEM_MARKERS.map(p => new RegExp(p, 'i'));
const emotionRegex = EMOTION_MARKERS.map(p => new RegExp(p, 'i'));

export function extractMemories(text: string): ExtractedMemory[] {
  // Enforce normalization before extraction
  const cleanText = normalizeContent(text);
  
  const chunks = cleanText.split('\n\n').filter(c => c.trim());
  const memories: ExtractedMemory[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    if (matchesAny(chunk, decisionRegex)) {
      memories.push({ content: chunk, memoryType: 'decision', chunkIndex: i });
    } else if (matchesAny(chunk, preferenceRegex)) {
      memories.push({ content: chunk, memoryType: 'preference', chunkIndex: i });
    } else if (matchesAny(chunk, milestoneRegex)) {
      memories.push({ content: chunk, memoryType: 'milestone', chunkIndex: i });
    } else if (matchesAny(chunk, problemRegex)) {
      memories.push({ content: chunk, memoryType: 'problem', chunkIndex: i });
    } else if (matchesAny(chunk, emotionRegex)) {
      memories.push({ content: chunk, memoryType: 'emotional', chunkIndex: i });
    }
  }
  return memories;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  for (const p of patterns) {
    if (p.test(text)) return true;
  }
  return false;
}
