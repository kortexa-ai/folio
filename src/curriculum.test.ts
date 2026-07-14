import { describe, expect, it } from 'vitest';
import { chooseTopic, completedEquation, EDGES, effectiveStrength, isMastered, isReviewDue, isStruggling, isUnlocked, makeProblem, problemSignature, recordAttempt, TOPICS, topicById, type Mastery } from './curriculum';

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

describe('memory strength and spaced review', () => {
  const DAY = 24 * 3_600_000;
  const master = (id: string, now: number) => {
    let m: Mastery = {};
    for (let i = 0; i < 4; i++) m = recordAttempt(m, id, true, true, { now });
    return m;
  };
  it('strength builds on success, drops on misses, and decays over time', () => {
    const now = 1_000_000;
    let m = master('mt_OvyoRo47K-', now);
    expect(m['mt_OvyoRo47K-'].strength).toBe(1);
    expect(effectiveStrength(m['mt_OvyoRo47K-'], now)).toBe(1);
    expect(effectiveStrength(m['mt_OvyoRo47K-'], now + 60 * DAY)).toBeLessThan(0.02);
    m = recordAttempt(m, 'mt_OvyoRo47K-', false, false, { now });
    expect(m['mt_OvyoRo47K-'].strength).toBe(0.8);
  });
  it('a freshly mastered topic is not due; a long-faded one is', () => {
    const now = 1_000_000;
    const m = master('mt_OvyoRo47K-', now);
    expect(isReviewDue(m['mt_OvyoRo47K-'], now + DAY)).toBe(false);
    expect(isReviewDue(m['mt_OvyoRo47K-'], now + 60 * DAY)).toBe(true);
  });
  it('chooseTopic serves the faded review even when fresh topics remain', () => {
    const now = 1_000_000;
    const m = master('mt_OvyoRo47K-', now);
    const later = now + 60 * DAY;
    // random() = 0 → takes the review branch whenever a review is due
    expect(chooseTopic(m, () => 0, later).id).toBe('mt_OvyoRo47K-');
    // random() high → sticks with fresh material
    expect(isMastered(m[chooseTopic(m, () => 0.99, later).id])).toBe(false);
  });
  it('detects struggle after repeated misses and offers a prerequisite warm-up', () => {
    const now = 1_000_000;
    let m = { ...master('mt_OvyoRo47K-', now), ...master('mt_zuKAX6lcYR', now), ...master('mt_e8CZ7E5qW7', now) };
    m = { ...m, ...master('mt_ghF3Vv6taM', now), ...master('mt_PgsHGYJMH-', now), ...master('mt_yJmvUCCym7', now) };
    // now 'Quick facts to 10' (needs bonds + fluency-5) is unlocked; miss it repeatedly
    for (let i = 0; i < 4; i++) m = recordAttempt(m, 'mt__we2TDqnJx', false, false, { now });
    expect(isStruggling(m['mt__we2TDqnJx'])).toBe(true);
    const warmup = chooseTopic(m, () => 0, now);
    expect(['mt_e8CZ7E5qW7', 'mt_ghF3Vv6taM']).toContain(warmup.id);
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
        expect(p.scaffold).toBeDefined();
        expect(completedEquation(p)).toContain(String(p.answer));
        expect(completedEquation(p)).not.toContain('□');
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
  it('never repeats a recently seen instance ("it asked me 8 + 2 again")', () => {
    const bonds = topicById.get('mt_e8CZ7E5qW7')!; // only nine possible pages
    const r = seeded(5);
    const recent: string[] = [];
    for (let i = 0; i < 30; i++) {
      const p = makeProblem(bonds, r, new Set(recent));
      expect(recent).not.toContain(problemSignature(p));
      recent.push(problemSignature(p));
      if (recent.length > 4) recent.shift();
    }
  });
});

describe('interleaving', () => {
  const seq = (...values: number[]) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };
  it('sometimes visits another open chapter instead of drilling one', () => {
    // fresh notebook: three chapters open; draws → interleave branch, second pick
    const other = chooseTopic({}, seq(0.1, 0.9));
    expect(other.id).not.toBe(chooseTopic({}, () => 0.99).id);
    expect(isUnlocked(other.id, {})).toBe(true);
  });
});
