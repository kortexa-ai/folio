import { describe, expect, it } from 'vitest';
import { makeProblem, nextOperation } from './math';

describe('arithmetic progression', () => {
  it('never makes negative single-digit subtraction', () => {
    const problem = makeProblem('subtract', () => 0.1);
    expect(problem.left).toBeGreaterThanOrEqual(problem.right);
    expect(problem.answer).toBeGreaterThanOrEqual(0);
  });
  it('unlocks operations in order', () => {
    expect(nextOperation({ add: 4, subtract: 9, multiply: 9 })).toBe('add');
    expect(nextOperation({ add: 5, subtract: 4, multiply: 9 })).toBe('subtract');
    expect(nextOperation({ add: 5, subtract: 5, multiply: 0 })).toBe('multiply');
  });
});
