import * as fs from 'fs';
import * as path from 'path';
import { VectorStorage } from '../storage/vector';
import { evaluateRetrieval } from './metrics';

async function runBenchmark(datasetPath: string, limit?: number) {
  const data = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  const questions = limit ? data.slice(0, limit) : data;
  let totalRecallAny = 0;
  let totalNDCG = 0;

  console.log(`Running benchmark on ${questions.length} questions...`);

  // Optimization: Instantiate storage once. 
  // We'll clear the table between queries to simulate a "fresh" palace.
  const dbPath = path.join('/tmp', 'mempalace_bench_shared');
  const storage = new VectorStorage(dbPath, 'bench_drawers');
  await storage.init();

  for (let i = 0; i < questions.length; i++) {
    const entry = questions[i];
    if (i % 10 === 0) console.log(`Processing question ${i}/${questions.length}...`);

    // 1. Reset storage
    await storage.clearTable();

    // 2. Ingest sessions
    for (let j = 0; j < entry.haystack_sessions.length; j++) {
        const session = entry.haystack_sessions[j];
        const userTurns = session.filter((t: any) => t.role === 'user');
        if (userTurns.length > 0) {
            await storage.upsertDrawer({
                id: entry.haystack_session_ids[j],
                content: userTurns.map((t: any) => t.content).join('\n'),
                wing: 'bench',
                room: 'data',
                sourceFile: 'bench.txt',
                chunkIndex: 0,
                addedBy: 'bench',
                filedAt: entry.haystack_dates[j]
            });
        }
    }

    // 3. Query
    const results = await storage.search(entry.question, 50);
    const rankedIndices = results.map(r => entry.haystack_session_ids.indexOf(r.id));
    
    // Evaluate
    const correctIds = new Set<string>(entry.answer_session_ids);
    const metrics = evaluateRetrieval(rankedIndices, correctIds, entry.haystack_session_ids, 5);
    
    totalRecallAny += metrics.recallAny;
    totalNDCG += metrics.ndcg;
  }

  console.log(`Recall@5: ${(totalRecallAny / questions.length).toFixed(3)}`);
  console.log(`NDCG@5: ${(totalNDCG / questions.length).toFixed(3)}`);

  await storage.close();
}

// Update command line argument handling
const dataPath = process.argv[2];
const limitArg = process.argv[3] ? parseInt(process.argv[3]) : undefined;
if (dataPath) runBenchmark(dataPath, limitArg);
else console.error("Please provide path to LongMemEval dataset");
