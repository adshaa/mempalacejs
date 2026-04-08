import { 
  DECISION_MARKERS, PREFERENCE_MARKERS, MILESTONE_MARKERS, 
  PROBLEM_MARKERS, EMOTION_MARKERS 
} from './general_extractor_constants';

export interface ExtractedMemory {
  content: string;
  memoryType: 'decision' | 'preference' | 'milestone' | 'problem' | 'emotional';
  chunkIndex: number;
}

export function extractMemories(text: string): ExtractedMemory[] {
  const chunks = text.split('\n\n').filter(c => c.trim());
  const memories: ExtractedMemory[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    if (matchesAny(chunk, DECISION_MARKERS)) {
      memories.push({ content: chunk, memoryType: 'decision', chunkIndex: i });
    } else if (matchesAny(chunk, PREFERENCE_MARKERS)) {
      memories.push({ content: chunk, memoryType: 'preference', chunkIndex: i });
    } else if (matchesAny(chunk, MILESTONE_MARKERS)) {
      memories.push({ content: chunk, memoryType: 'milestone', chunkIndex: i });
    } else if (matchesAny(chunk, PROBLEM_MARKERS)) {
      memories.push({ content: chunk, memoryType: 'problem', chunkIndex: i });
    } else if (matchesAny(chunk, EMOTION_MARKERS)) {
      memories.push({ content: chunk, memoryType: 'emotional', chunkIndex: i });
    }
  }
  return memories;
}

function matchesAny(text: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (new RegExp(p, 'i').test(text)) return true;
  }
  return false;
}
