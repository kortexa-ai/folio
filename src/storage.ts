import { freshTopicMastery, type Mastery, type TopicMastery, TOPICS } from './curriculum';

export type Session = { start: number; end: number; solved: number; misses: number; hints: number };

export type Progress = {
  version: 3;
  mastery: Mastery;
  attempts: number;
  streak: number;
  startedAt: string;
  lastActiveAt: number;
  sessions: Session[];
};

const SESSION_GAP = 30 * 60_000;
const SESSIONS_KEEP = 40;

export const freshProgress = (): Progress =>
  ({ version: 3, mastery: {}, attempts: 0, streak: 0, startedAt: new Date().toISOString(), lastActiveAt: 0, sessions: [] });

/** Fold an event into the session log; a long quiet gap starts a new session. */
export function touchSession(progress: Progress, event: 'solved' | 'miss' | 'hint', now = Date.now()): Progress {
  const sessions = [...progress.sessions];
  let current = sessions[sessions.length - 1];
  if (!current || now - progress.lastActiveAt > SESSION_GAP) {
    current = { start: now, end: now, solved: 0, misses: 0, hints: 0 };
    sessions.push(current);
  } else {
    current = { ...current };
    sessions[sessions.length - 1] = current;
  }
  current.end = now;
  if (event === 'solved') current.solved += 1;
  if (event === 'miss') current.misses += 1;
  if (event === 'hint') current.hints += 1;
  return { ...progress, sessions: sessions.slice(-SESSIONS_KEEP), lastActiveAt: now };
}

/** How many distinct days the notebook has been written in. */
export const daysWritten = (progress: Progress): number =>
  new Set(progress.sessions.map(s => new Date(s.start).toDateString())).size;

// --- migrations ----------------------------------------------------------------

/** Map a v1 export (per-operation counts) onto the corresponding entry topics. */
function migrateV1(v1: { solved?: Record<string, number>; attempts?: number; streak?: number; startedAt?: string }): Progress {
  const progress = freshProgress();
  const map: Record<string, string> = { add: 'mt_OvyoRo47K-', subtract: 'mt_zuKAX6lcYR', multiply: 'mt_PZ909yPrEC' };
  for (const [op, topicId] of Object.entries(map)) {
    const solved = v1.solved?.[op] ?? 0;
    if (solved > 0) progress.mastery[topicId] = {
      ...freshTopicMastery(), attempts: solved, correct: solved,
      streak: Math.min(solved, 4), strength: Math.min(solved * 0.25, 1), lastSeen: Date.now(),
    };
  }
  progress.attempts = v1.attempts ?? 0;
  progress.streak = v1.streak ?? 0;
  if (v1.startedAt) progress.startedAt = v1.startedAt;
  return progress;
}

/** Fill in the v3 per-topic fields a v2 (or partial) record lacks. */
function upgradeTopicMastery(raw: Record<string, number>): TopicMastery {
  const m: TopicMastery = { ...freshTopicMastery(), attempts: raw.attempts, correct: raw.correct, streak: raw.streak, lastSeen: raw.lastSeen };
  m.strength = typeof raw.strength === 'number' ? raw.strength
    : m.streak >= 4 || (m.correct >= 6 && m.correct / Math.max(m.attempts, 1) >= 0.8) ? 0.9
    : Math.min(m.correct * 0.15, 0.6);
  m.hints = typeof raw.hints === 'number' ? raw.hints : 0;
  m.ms = typeof raw.ms === 'number' ? raw.ms : 0;
  const history = (raw as unknown as TopicMastery).history;
  m.history = Array.isArray(history) ? history.filter(o => (o?.c === 0 || o?.c === 1) && typeof o.h === 'number' && typeof o.t === 'number').slice(-8) : [];
  return m;
}

const validMasteryCore = (m: unknown): m is Record<string, Record<string, number>> =>
  !!m && typeof m === 'object' && Object.entries(m as object).every(([id, v]) =>
    TOPICS.some(t => t.id === id) &&
    ['attempts', 'correct', 'streak', 'lastSeen'].every(k => typeof (v as Record<string, unknown>)[k] === 'number' && (v as Record<string, number>)[k] >= 0));

export function coerceProgress(raw: unknown): Progress {
  const value = raw as Omit<Partial<Progress>, 'version'> & { version?: number; solved?: Record<string, number> };
  if (value?.solved) return migrateV1(value);
  if ((value?.version === 2 || value?.version === 3) && validMasteryCore(value.mastery)
    && typeof value.attempts === 'number' && typeof value.streak === 'number') {
    const mastery: Mastery = Object.fromEntries(
      Object.entries(value.mastery as Record<string, Record<string, number>>).map(([id, m]) => [id, upgradeTopicMastery(m)]));
    return {
      ...freshProgress(),
      attempts: value.attempts,
      streak: value.streak,
      startedAt: typeof value.startedAt === 'string' ? value.startedAt : new Date().toISOString(),
      lastActiveAt: typeof value.lastActiveAt === 'number' ? value.lastActiveAt : 0,
      sessions: Array.isArray(value.sessions)
        ? value.sessions.filter(s => ['start', 'end', 'solved', 'misses', 'hints'].every(k => typeof (s as unknown as Record<string, unknown>)[k] === 'number')).slice(-SESSIONS_KEEP)
        : [],
      mastery,
    };
  }
  throw new Error('Not a valid Folio progress record.');
}

export const loadProgress = (): Progress => {
  try { return coerceProgress(JSON.parse(localStorage.getItem('folio-progress') ?? '')); }
  catch { return freshProgress(); }
};
export const saveProgress = (progress: Progress) => localStorage.setItem('folio-progress', JSON.stringify(progress));

export const downloadProgress = (progress: Progress) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 3, progress }, null, 2)], { type: 'application/json' }));
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
