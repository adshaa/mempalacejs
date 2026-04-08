import { parentPort } from 'worker_threads';
import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
}

interface EmbeddingRequest {
  id: string;
  texts: string[];
}

if (parentPort) {
  parentPort.on('message', async (message: EmbeddingRequest) => {
    const { id, texts } = message;
    try {
      const pipeline = await getExtractor();
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
