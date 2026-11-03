// 本机语音转文字的 worker 线程：模型只加载一次，一次转一段。见 stt.js。
import path from 'node:path';
import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

const sherpa = createRequire(import.meta.url)('sherpa-onnx-node');
const recognizer = new sherpa.OfflineRecognizer({
  featConfig: { sampleRate: 16_000, featureDim: 80 },
  modelConfig: {
    senseVoice: { model: path.join(workerData.dir, 'model.int8.onnx'), useInverseTextNormalization: 1 },
    tokens: path.join(workerData.dir, 'tokens.txt'),
    numThreads: 2,
    provider: 'cpu',
    debug: 0,
  },
});

parentPort.on('message', ({ id, samples }) => {
  try {
    const stream = recognizer.createStream();
    stream.acceptWaveform({ sampleRate: 16_000, samples });
    recognizer.decode(stream);
    parentPort.postMessage({ id, text: recognizer.getResult(stream).text.trim() });
  } catch (e) {
    parentPort.postMessage({ id, error: e.message });
  }
});
