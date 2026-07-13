export { MODEL_ID, SYSTEM_PROMPT } from './tutorPrompt';
import { SYSTEM_PROMPT } from './tutorPrompt';

let worker: Worker | undefined;
let requestId = 0;
let awake = false;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void; progress?: (message: string) => void }>();

// Lazy: the worker (and its module) only exists once someone wakes the brain.
function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./localTutor.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<{ id: number; type: 'progress' | 'result' | 'error'; text?: string; message?: string }>) => {
    const request = pending.get(event.data.id); if (!request) return;
    if (event.data.type === 'progress') return request.progress?.(event.data.message ?? 'Preparing local tutor…');
    pending.delete(event.data.id);
    if (event.data.type === 'error') request.reject(new Error(event.data.message));
    else request.resolve(event.data.text ?? '');
  };
  return worker;
}

const askWorker = (message: object, progress?: (message: string) => void) => new Promise<string>((resolve, reject) => {
  const id = ++requestId; pending.set(id, { resolve, reject, progress }); getWorker().postMessage({ id, ...message });
});

/** Is the little brain loaded and ready to think? */
export const isAwake = () => awake;

export async function loadTutor(onProgress?: (message: string) => void) {
  if (!('gpu' in navigator)) throw new Error('WebGPU is not available in this browser.');
  onProgress?.('Opening the local model…');
  await askWorker({ type: 'load' }, onProgress);
  awake = true;
}

export async function sleepTutor() {
  awake = false;
  await askWorker({ type: 'dispose' });
}

/** One grounded generation. Callers must validate the output before showing it. */
export function generate(system: string, user: string, options: { maxNewTokens?: number; temperature?: number } = {}) {
  return askWorker({ type: 'generate', system, user, ...options });
}

export function getLocalHint(problem: string, attempt: string) {
  return generate(SYSTEM_PROMPT,
    `Problem: ${problem}. Learner's attempt: ${attempt || 'no answer yet'}. Give one hint.`,
    { maxNewTokens: 42, temperature: 0.3 });
}

if (typeof addEventListener === 'function') {
  addEventListener('pagehide', () => { if (!worker) return; awake = false; worker.postMessage({ id: ++requestId, type: 'dispose' }); });
}
