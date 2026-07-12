import { describe, expect, it } from 'vitest';
import { chooseTopic, EDGES, isMastered, isUnlocked, makeProblem, recordAttempt, TOPICS, topicById, type Mastery } from './curriculum';

const seeded = (seed = 1) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

describe('taxonomy slice', () => {
  it('has valid edges (both endpoints exist, acyclic by construction of the slice)', () => {
    for (const e of EDGES) {
      expect(topicById.has(e.topicId)).toBe(true);
      expect(topicById.has(e.prerequisiteId)).toBe(true);
      expect(e.topicId).not.toBe(e.prerequisiteId);
    }
  });
  it('starts with only the two root concepts unlocked (plus bonds, which has no in-slice prereq)', () => {
    const open = TOPICS.filter(t => isUnlocked(t.id, {}));
    expect(open.map(t => t.id).sort()).toEqual(['mt_OvyoRo47K-', 'mt_e8CZ7E5qW7', 'mt_zuKAX6lcYR'].sort());
  });
});

describe('mastery and progression', () => {
  it('marks a topic mastered after a first-try streak and unlocks dependents', () => {
    let m: Mastery = {};
    for (let i = 0; i < 4; i++) m = recordAttempt(m, 'mt_OvyoRo47K-', true, true);
    expect(isMastered(m['mt_OvyoRo47K-'])).toBe(true);
    expect(isUnlocked('mt_8RmpkDxT9L', m)).toBe(false); // still needs subtraction
    for (let i = 0; i < 4; i++) m = recordAttempt(m, 'mt_zuKAX6lcYR', true, true);
    expect(isUnlocked('mt_8RmpkDxT9L', m)).toBe(true);
  });
  it('a wrong answer resets the streak', () => {
    let m: Mastery = {};
    for (let i = 0; i < 3; i++) m = recordAttempt(m, 'mt_OvyoRo47K-', true, true);
    m = recordAttempt(m, 'mt_OvyoRo47K-', false, false);
    expect(m['mt_OvyoRo47K-'].streak).toBe(0);
  });
  it('chooseTopic always returns an unlocked topic', () => {
    const r = seeded(7);
    let m: Mastery = {};
    for (let i = 0; i < 200; i++) {
      const t = chooseTopic(m, r);
      expect(isUnlocked(t.id, m)).toBe(true);
      m = recordAttempt(m, t.id, r() < 0.8, true);
    }
  });
});

describe('problem generation', () => {
  it('every topic generates valid problems with correct answers in range', () => {
    const r = seeded(42);
    for (const topic of TOPICS) {
      for (let i = 0; i < 50; i++) {
        const p = makeProblem(topic, r);
        expect(p.topicId).toBe(topic.id);
        expect(Number.isInteger(p.answer)).toBe(true);
        expect(p.answer).toBeGreaterThanOrEqual(0);
        expect(p.answer).toBeLessThanOrEqual(90);
        expect(p.statement.length).toBeGreaterThan(0);
        expect(p.hint1.length).toBeGreaterThan(0);
        if (p.equation) expect(p.equation).toContain('□');
      }
    }
  });
  it('problems vary (generated, not a fixed bank)', () => {
    const r = seeded(3);
    const topic = topicById.get('mt_yJmvUCCym7')!;
    const statements = new Set(Array.from({ length: 30 }, () => makeProblem(topic, r).statement));
    expect(statements.size).toBeGreaterThan(10);
  });
});
