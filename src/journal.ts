// The notebook's black box: a tiny ring buffer of technical events in
// localStorage, written through synchronously so it survives tab crashes.
// No learner content ever goes in here — only lifecycle and error breadcrumbs —
// and it exists so a grown-up can read/copy what happened right on the device.

export type JournalEntry = { t: number; m: string };

const KEY = 'folio-journal';
const KEEP = 60;

export function logEvent(message: string): void {
  try {
    const entries = readJournal();
    entries.push({ t: Date.now(), m: message.slice(0, 200) });
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-KEEP)));
  } catch { /* quota or storage blocked — the journal is best-effort */ }
}

export function readJournal(): JournalEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(e => typeof e?.t === 'number' && typeof e?.m === 'string') : [];
  } catch { return []; }
}

export const clearJournal = (): void => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

/** The whole journal plus device info, as text to paste to an engineer. */
export function journalReport(): string {
  const lines = readJournal().map(e => `${new Date(e.t).toISOString()} ${e.m}`);
  return [`Folio journal · ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown UA'}`, ...lines].join('\n');
}
