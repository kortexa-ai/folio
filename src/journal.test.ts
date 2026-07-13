import { beforeEach, describe, expect, it } from 'vitest';
import { clearJournal, journalReport, logEvent, readJournal } from './journal';

// journal talks to localStorage directly — give Node a tiny shim
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
});

describe('the black-box journal', () => {
  it('records events and reads them back in order', () => {
    logEvent('boot');
    logEvent('brain: waking');
    expect(readJournal().map(e => e.m)).toEqual(['boot', 'brain: waking']);
    expect(readJournal().every(e => typeof e.t === 'number')).toBe(true);
  });
  it('keeps only the most recent 60 entries', () => {
    for (let i = 0; i < 70; i++) logEvent(`event ${i}`);
    const entries = readJournal();
    expect(entries).toHaveLength(60);
    expect(entries[0].m).toBe('event 10');
    expect(entries[59].m).toBe('event 69');
  });
  it('survives garbage in storage and clears cleanly', () => {
    store.set('folio-journal', '{broken');
    expect(readJournal()).toEqual([]);
    logEvent('fresh start');
    expect(readJournal()).toHaveLength(1);
    clearJournal();
    expect(readJournal()).toEqual([]);
  });
  it('renders a pasteable report with timestamps', () => {
    logEvent('boot');
    const report = journalReport();
    expect(report).toContain('Folio journal');
    expect(report).toMatch(/\d{4}-\d{2}-\d{2}T.*boot/);
  });
});
