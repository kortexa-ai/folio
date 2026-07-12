import { describe, expect, it } from 'vitest';
import { parseProgressExport } from './storage';

describe('progress imports', () => {
  it('accepts a valid versioned export', () => {
    const progress = parseProgressExport(JSON.stringify({ version: 1, progress: { solved: { add: 5, subtract: 2, multiply: 0 }, attempts: 8, streak: 2 } }));
    expect(progress.solved.subtract).toBe(2);
    expect(progress.startedAt).toBeTruthy();
  });
  it('rejects malformed or negative progress', () => {
    expect(() => parseProgressExport(JSON.stringify({ version: 1, progress: { solved: { add: -1 } } }))).toThrow('valid Folio');
  });
});
