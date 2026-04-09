import { parentPort } from 'worker_threads';
import { pipeline, FeatureExtractionPipeline, env } from '@xenova/transformers';

// Configuration to prevent stdout corruption in MCP mode
env.allowLocalModels = true;

let extractor: FeatureExtractionPipeline | null = null;
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor() {
  if (extractor) return extractor;
  if (extractorPromise) return extractorPromise;

  process.stderr.write(`[MemPalace AI Model] Initializing transformer...\n`);
  extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      // Redirect progress to stderr so it doesn't break MCP stdout JSON-RPC
      progress_callback: (info: any) => {
          if (info.status === 'progress') {
              process.stderr.write(`[MemPalace AI Model] Downloading: ${info.file} ${info.progress.toFixed(1)}%\r`);
          } else if (info.status === 'done') {
              process.stderr.write(`[MemPalace AI Model] Downloaded: ${info.file}\n`);
          }
      }
  });

  extractor = await extractorPromise;
  process.stderr.write(`[MemPalace AI Model] Ready.\n`);
  return extractor;
}

interface EmbeddingRequest {
  id: string;
  texts?: string[];
  type?: 'SETUP';
}

if (parentPort) {
  parentPort.on('message', async (message: EmbeddingRequest) => {
    const { id, texts, type } = message;
    try {
      const pipeline = await getExtractor();
      
      if (type === 'SETUP') {
        parentPort?.postMessage({ id, status: 'ready' });
        return;
      }

      if (!texts) return;

      const output = await pipeline(texts, { pooling: 'mean', normalize: true });
      
      // If single text, output.data is a single array. 
      // If multiple texts, output.data is a flattened array of all embeddings.
      // Transformers.js returns a Tensor.
      
      const embeddings: number[][] = [];
      const dims = output.dims; // e.g. [2, 384]
      const data = output.data;
      
      if (dims.length === 2) {
        const numEmbeddings = dims[0];
        const embeddingSize = dims[1];
        for (let i = 0; i < numEmbeddings; i++) {
          embeddings.push(Array.from(data.slice(i * embeddingSize, (i + 1) * embeddingSize)) as number[]);
        }
      } else {
        // Single embedding case (though pipeline with array usually returns 2D)
        embeddings.push(Array.from(data) as number[]);
      }

      parentPort?.postMessage({ id, embeddings });
    } catch (error) {
      parentPort?.postMessage({ id, error: (error as Error).message });
    }
  });
}
