/**
 * Benchmark evaluation metrics
 */

export function dcg(relevances: number[], k: number): number {
  let score = 0.0;
  for (let i = 0; i < Math.min(k, relevances.length); i++) {
    score += relevances[i] / Math.log2(i + 2);
  }
  return score;
}

export function ndcg(rankings: number[], correctIds: Set<string>, corpusIds: string[], k: number): number {
  const relevances = rankings.slice(0, k).map(idx => correctIds.has(corpusIds[idx]) ? 1.0 : 0.0);
  const ideal = [...relevances].sort((a, b) => b - a);
  const idcg = dcg(ideal, k);
  if (idcg === 0) return 0.0;
  return dcg(relevances, k) / idcg;
}

export function evaluateRetrieval(
  rankings: number[], 
  correctIds: Set<string>, 
  corpusIds: string[], 
  k: number
): { recallAny: number, recallAll: number, ndcg: number } {
  const topKIds = new Set(rankings.slice(0, k).map(idx => corpusIds[idx]));
  
  let anyMatch = false;
  for (const cid of correctIds) {
    if (topKIds.has(cid)) {
      anyMatch = true;
      break;
    }
  }

  const allMatch = Array.from(correctIds).every(cid => topKIds.has(cid));

  return {
    recallAny: anyMatch ? 1.0 : 0.0,
    recallAll: allMatch ? 1.0 : 0.0,
    ndcg: ndcg(rankings, correctIds, corpusIds, k)
  };
}
