

export { MODEL_ID, SYSTEM_PROMPT } from './tutorPrompt';

const worker = new Worker(new URL('./localTutor.worker.ts', import.meta.url), { type: 'module' });
let requestId = 0;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void; progress?: (message: string) => void }>();

worker.onmessage = (event: MessageEvent<{ id: number; type: 'progress' | 'result' | 'error'; text?: string; message?: string }>) => {
  const request = pending.get(event.data.id); if (!request) return;
  if (event.data.type === 'progress') return request.progress?.(event.data.message ?? 'Preparing local tutor…');
  pending.delete(event.data.id);
  if (event.data.type === 'error') request.reject(new Error(event.data.message));
  else request.resolve(event.data.text ?? '');
};

const askWorker = (message: object, progress?: (message: string) => void) => new Promise<string>((resolve, reject) => {
  const id = ++requestId; pending.set(id, { resolve, reject, progress }); worker.postMessage({ id, ...message });
});

export async function loadTutor(onProgress?: (message: string) => void) {
  if (!('gpu' in navigator)) throw new Error('WebGPU is not available in this browser.');
  onProgress?.('Opening the local model…');
  await askWorker({ type: 'load' }, onProgress);
}

export async function getLocalHint(problem: string, attempt: string) {
  return askWorker({ type: 'hint', problem, attempt });
}

addEventListener('pagehide', () => { worker.postMessage({ id: ++requestId, type: 'dispose' }); });
