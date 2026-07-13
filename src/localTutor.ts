export { MODEL_ID, SYSTEM_PROMPT } from './tutorPrompt';
import { MODEL_ID, SYSTEM_PROMPT, withIdentity } from './tutorPrompt';
import { logEvent } from './journal';

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

// --- crash-loop guard ----------------------------------------------------------
// Loading a model can kill the tab outright on memory-starved devices (iOS
// Safari reloads the page, auto-wake fires again — an endless crash loop).
// A sentinel is kept in localStorage exactly while the brain is awake AND the
// page is visible; a crash never clears it, while backgrounding and clean
// exits do. Finding it at startup means last time ended badly.
const SENTINEL = 'folio-brain-active';
const setSentinel = (on: boolean) => {
  try { on ? localStorage.setItem(SENTINEL, String(Date.now())) : localStorage.removeItem(SENTINEL); } catch { /* storage full/blocked */ }
};

/** Did the last session die while the brain was awake? Clears the flag when read. */
export function tookDownLastSession(): boolean {
  const crashed = localStorage.getItem(SENTINEL) != null;
  setSentinel(false);
  return crashed;
}

export async function loadTutor(onProgress?: (message: string) => void) {
  if (!('gpu' in navigator)) throw new Error('WebGPU is not available in this browser.');
  onProgress?.('Opening the local model…');
  logEvent(`brain: waking ${MODEL_ID}`);
  setSentinel(true); // armed through the risky part — a crash here leaves it behind
  let lastMilestone = -1;
  try {
    await askWorker({ type: 'load' }, message => {
      const percent = Number(message.match(/(\d+)%/)?.[1] ?? -1);
      const milestone = Math.floor(percent / 25);
      if (percent >= 0 && milestone > lastMilestone) { lastMilestone = milestone; logEvent(`brain: loading ${percent}%`); }
      onProgress?.(message);
    });
    awake = true;
    logEvent('brain: awake');
  } catch (error) {
    setSentinel(false); // a clean failure is not a crash
    logEvent(`brain: load failed cleanly — ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export async function sleepTutor() {
  awake = false;
  setSentinel(false);
  logEvent('brain: put to sleep');
  await askWorker({ type: 'dispose' });
}

if (typeof document !== 'undefined') {
  // Backgrounding is a normal way for iOS to reclaim a PWA — only a death
  // while visible counts as a crash.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setSentinel(false);
    else if (awake) setSentinel(true);
  });
}

/** One grounded generation. Callers must validate the output before showing it. */
export function generate(system: string, user: string, options: { maxNewTokens?: number; temperature?: number } = {}) {
  return askWorker({ type: 'generate', system, user, ...options });
}

export function getLocalHint(problem: string, attempt: string, name?: string) {
  return generate(withIdentity(SYSTEM_PROMPT, name),
    `Problem: ${problem}. Learner's attempt: ${attempt || 'no answer yet'}. Give one hint.`,
    { maxNewTokens: 42, temperature: 0.3 });
}

if (typeof addEventListener === 'function') {
  addEventListener('pagehide', () => { setSentinel(false); if (!worker) return; awake = false; worker.postMessage({ id: ++requestId, type: 'dispose' }); });
}
