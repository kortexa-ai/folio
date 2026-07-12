import { describe, expect, it } from 'vitest';
import { parseProgressExport } from './storage';

describe('progress imports', () => {
  it('accepts a v2 mastery export', () => {
    const progress = parseProgressExport(JSON.stringify({ version: 2, progress: {
      version: 2, mastery: { 'mt_OvyoRo47K-': { attempts: 5, correct: 4, streak: 4, lastSeen: 1 } }, attempts: 5, streak: 2, startedAt: '2026-07-01' } }));
    expect(progress.mastery['mt_OvyoRo47K-'].correct).toBe(4);
  });
  it('migrates a v1 per-operation export onto entry topics', () => {
    const progress = parseProgressExport(JSON.stringify({ version: 1, progress: { solved: { add: 5, subtract: 2, multiply: 0 }, attempts: 8, streak: 2 } }));
    expect(progress.version).toBe(2);
    expect(progress.mastery['mt_OvyoRo47K-'].correct).toBe(5);
    expect(progress.mastery['mt_zuKAX6lcYR'].correct).toBe(2);
    expect(progress.mastery['mt_PZ909yPrEC']).toBeUndefined();
  });
  it('rejects malformed exports', () => {
    expect(() => parseProgressExport(JSON.stringify({ version: 2, progress: { version: 2, mastery: { bogus: { attempts: -1 } } } }))).toThrow('valid Folio');
    expect(() => parseProgressExport(JSON.stringify({ hello: 1 }))).toThrow('valid Folio');
  });
});
