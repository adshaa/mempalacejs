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
  text: string;
}

if (parentPort) {
  parentPort.on('message', async (message: EmbeddingRequest) => {
    const { id, text } = message;
    try {
      const pipeline = await getExtractor();
      const output = await pipeline(text, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data);
      parentPort?.postMessage({ id, embedding });
    } catch (error) {
      parentPort?.postMessage({ id, error: (error as Error).message });
    }
  });
}
