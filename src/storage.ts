import { freshTopicMastery, type Mastery, TOPICS } from './curriculum';

export type Progress = {
  version: 2;
  mastery: Mastery;
  attempts: number;
  streak: number;
  startedAt: string;
};

export const freshProgress = (): Progress =>
  ({ version: 2, mastery: {}, attempts: 0, streak: 0, startedAt: new Date().toISOString() });

/** Map a v1 export (per-operation counts) onto the corresponding entry topics. */
function migrateV1(v1: { solved?: Record<string, number>; attempts?: number; streak?: number; startedAt?: string }): Progress {
  const progress = freshProgress();
  const map: Record<string, string> = { add: 'mt_OvyoRo47K-', subtract: 'mt_zuKAX6lcYR', multiply: 'mt_PZ909yPrEC' };
  for (const [op, topicId] of Object.entries(map)) {
    const solved = v1.solved?.[op] ?? 0;
    if (solved > 0) progress.mastery[topicId] = { ...freshTopicMastery(), attempts: solved, correct: solved, streak: Math.min(solved, 4), lastSeen: Date.now() };
  }
  progress.attempts = v1.attempts ?? 0;
  progress.streak = v1.streak ?? 0;
  if (v1.startedAt) progress.startedAt = v1.startedAt;
  return progress;
}

const validMastery = (m: unknown): m is Mastery =>
  !!m && typeof m === 'object' && Object.entries(m as object).every(([id, v]) =>
    TOPICS.some(t => t.id === id) &&
    ['attempts', 'correct', 'streak', 'lastSeen'].every(k => typeof (v as Record<string, unknown>)[k] === 'number' && (v as Record<string, number>)[k] >= 0));

export function coerceProgress(raw: unknown): Progress {
  const value = raw as Partial<Progress> & { solved?: Record<string, number> };
  if (value?.solved) return migrateV1(value);
  if (value?.version === 2 && validMastery(value.mastery)
    && typeof value.attempts === 'number' && typeof value.streak === 'number') {
    return { ...freshProgress(), ...value, mastery: value.mastery } as Progress;
  }
  throw new Error('Not a valid Folio progress record.');
}

export const loadProgress = (): Progress => {
  try { return coerceProgress(JSON.parse(localStorage.getItem('folio-progress') ?? '')); }
  catch { return freshProgress(); }
};
export const saveProgress = (progress: Progress) => localStorage.setItem('folio-progress', JSON.stringify(progress));

export const downloadProgress = (progress: Progress) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, progress }, null, 2)], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: 'folio-progress.json' });
  link.click();
  URL.revokeObjectURL(url);
};

export function parseProgressExport(text: string): Progress {
  const parsed = JSON.parse(text) as { version?: number; progress?: unknown };
  if (!parsed?.progress) throw new Error('That file is not a valid Folio progress export.');
  try { return coerceProgress(parsed.progress); }
  catch { throw new Error('That file is not a valid Folio progress export.'); }
}
