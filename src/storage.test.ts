import { describe, expect, it } from 'vitest';
import { daysWritten, freshProgress, parseProgressExport, touchSession } from './storage';

describe('progress imports and migrations', () => {
  it('upgrades a v2 mastery export to v3, deriving memory strength', () => {
    const progress = parseProgressExport(JSON.stringify({ version: 2, progress: {
      version: 2, mastery: {
        'mt_OvyoRo47K-': { attempts: 5, correct: 4, streak: 4, lastSeen: 1 },   // mastered by streak
        'mt_zuKAX6lcYR': { attempts: 3, correct: 2, streak: 1, lastSeen: 1 },   // in progress
      }, attempts: 8, streak: 2, startedAt: '2026-07-01' } }));
    expect(progress.version).toBe(3);
    expect(progress.mastery['mt_OvyoRo47K-'].strength).toBe(0.9);
    expect(progress.mastery['mt_zuKAX6lcYR'].strength).toBeCloseTo(0.3);
    expect(progress.mastery['mt_OvyoRo47K-'].history).toEqual([]);
    expect(progress.sessions).toEqual([]);
  });
  it('accepts a v3 export round-trip, keeping sessions and history', () => {
    const original = touchSession(freshProgress(), 'solved', 1000);
    const roundTrip = parseProgressExport(JSON.stringify({ version: 3, progress: original }));
    expect(roundTrip.sessions).toEqual(original.sessions);
  });
  it('migrates a v1 per-operation export onto entry topics', () => {
    const progress = parseProgressExport(JSON.stringify({ version: 1, progress: { solved: { add: 5, subtract: 2, multiply: 0 }, attempts: 8, streak: 2 } }));
    expect(progress.version).toBe(3);
    expect(progress.mastery['mt_OvyoRo47K-'].correct).toBe(5);
    expect(progress.mastery['mt_OvyoRo47K-'].strength).toBe(1);
    expect(progress.mastery['mt_zuKAX6lcYR'].correct).toBe(2);
    expect(progress.mastery['mt_PZ909yPrEC']).toBeUndefined();
  });
  it('rejects malformed exports', () => {
    expect(() => parseProgressExport(JSON.stringify({ version: 2, progress: { version: 2, mastery: { bogus: { attempts: -1 } } } }))).toThrow('valid Folio');
    expect(() => parseProgressExport(JSON.stringify({ hello: 1 }))).toThrow('valid Folio');
  });
});

describe('sessions', () => {
  it('groups nearby events into one session and splits on a long gap', () => {
    let p = freshProgress();
    p = touchSession(p, 'solved', 1_000_000);
    p = touchSession(p, 'hint', 1_060_000);
    p = touchSession(p, 'miss', 1_120_000);
    expect(p.sessions).toHaveLength(1);
    expect(p.sessions[0]).toMatchObject({ solved: 1, hints: 1, misses: 1, start: 1_000_000, end: 1_120_000 });
    p = touchSession(p, 'solved', 1_120_000 + 31 * 60_000);
    expect(p.sessions).toHaveLength(2);
    expect(p.sessions[1].solved).toBe(1);
  });
  it('counts distinct days written', () => {
    let p = freshProgress();
    const day = 24 * 3_600_000;
    p = touchSession(p, 'solved', 5 * day);
    p = touchSession(p, 'solved', 5 * day + 60_000);
    p = touchSession(p, 'solved', 9 * day);
    expect(daysWritten(p)).toBe(2);
  });
});
