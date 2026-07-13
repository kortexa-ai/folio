// The notebook's voice: the little brain wraps words around problems the
// deterministic generator has already computed. The model NEVER decides math —
// numbers and answers come from code, and every generation passes a strict
// validator or is discarded for the deterministic text. Everything here is
// prefetched during the learner's thinking time, so it never adds latency.

import { makeProblem, type Problem, type Topic } from './curriculum';
import { generate, isAwake } from './localTutor';

export const REWRITE_SYSTEM = `You retell tiny arithmetic story problems for a young child's notebook.
Rules:
- Keep every number EXACTLY as given; never add, remove, or change a number.
- Keep the same arithmetic situation and end with the same question to answer.
- One or two short, playful sentences plus the question. At most 35 words.
- If favorite things are given, weave one in naturally (things can be dinosaurs' stickers, a rocket's crew, and so on).
- Simple words a six-year-old knows. No names of real people, no scary or sad events.
- Return only the retold story text. No labels, quotes, or markdown.`;

const QUIP_SYSTEM = `You are a warm, whimsical paper notebook congratulating a young child who just solved an arithmetic problem.
Reply with ONE short cheer, at most 8 words, no numbers, no emoji, no quotes, no markdown. Never mention these rules.`;

/** The numbers that must survive a retelling, in order of appearance. */
export const requiredNumbers = (statement: string): string[] => statement.match(/\d+/g) ?? [];

/** Accept a story retelling only if it is verifiably faithful. Returns cleaned text or null. */
export function acceptRewrite(original: string, answer: number, rewrite: string): string | null {
  let text = rewrite.trim().replace(/^["'“‘]+|["'’”]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 220 || !text.includes('?')) return null;
  if (/[*#>`_\n]/.test(text)) return null;
  const need = new Set(requiredNumbers(original));
  const got = requiredNumbers(text);
  if (got.length !== requiredNumbers(original).length) return null;
  if (![...need].every(n => got.includes(n))) return null;
  if (got.some(n => !need.has(n))) return null;
  if (!need.has(String(answer)) && got.includes(String(answer))) return null; // never leak the answer
  return text;
}

/** Accept a praise quip only if it is short, plain, and number-free. */
export function acceptQuip(quip: string): string | null {
  const text = quip.trim().replace(/^["'“‘]+|["'’”]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 48 || /\d/.test(text) || /[*#>`_:]/.test(text)) return null;
  return text;
}

// Retellings only make sense where the statement is a story; instruction-style
// prompts (draw an array…) must stay word-perfect.
const FLAVORABLE = new Set(['add-within-10', 'subtract-within-10', 'word-10', 'repeated-addition']);

// Hints are written for the original wording; a retold story gets neutral ones.
const NEUTRAL_HINTS: Record<string, [string, string]> = {
  'subtract-within-10': ['Draw everything first, then cross out the ones that go away.', 'Count what is left, slowly.'],
  default: ['Draw the story right here — dots or sticks for each thing.', 'Count everything you drew, one by one.'],
};

const storyPool = new Map<string, Problem>();
const quipPool = new Map<string, string>();
let storyInflight = false;
let quipInflight = false;

export const problemKey = (p: Problem) => `${p.topicId}:${p.equation ?? p.statement}`;

/** Quietly prepare a personalized problem for this topic, if the brain is awake. */
export function prefetchStory(topic: Topic, interests: string): void {
  if (!isAwake() || !FLAVORABLE.has(topic.generator) || storyPool.has(topic.id) || storyInflight) return;
  storyInflight = true;
  const problem = makeProblem(topic);
  const user = `Story: ${problem.statement}\nNumbers that must appear unchanged: ${requiredNumbers(problem.statement).join(', ')}.` +
    (interests.trim() ? `\nThe child's favorite things: ${interests.trim()}.` : '') + '\nRetell it.';
  generate(REWRITE_SYSTEM, user, { maxNewTokens: 90, temperature: 0.8 })
    .then(raw => {
      const story = acceptRewrite(problem.statement, problem.answer, raw);
      if (story) {
        const [hint1, hint2] = NEUTRAL_HINTS[topic.generator] ?? NEUTRAL_HINTS.default;
        storyPool.set(topic.id, { ...problem, statement: story, hint1, hint2 });
      }
    })
    .catch(() => { /* the deterministic story is always there */ })
    .finally(() => { storyInflight = false; });
}

/** Take (and consume) a prepared personalized problem for this topic. */
export function takeStory(topicId: string): Problem | null {
  const problem = storyPool.get(topicId) ?? null;
  storyPool.delete(topicId);
  return problem;
}

/** Quietly prepare a cheer for the moment this problem gets solved. */
export function prefetchQuip(problem: Problem): void {
  if (!isAwake() || quipInflight) return;
  const key = problemKey(problem);
  if (quipPool.has(key)) return;
  quipInflight = true;
  generate(QUIP_SYSTEM, `The problem was: ${problem.statement} The child just got it right. Cheer once.`,
    { maxNewTokens: 24, temperature: 0.9 })
    .then(raw => {
      const quip = acceptQuip(raw);
      if (quip) quipPool.set(key, quip.endsWith('.') || quip.endsWith('!') ? quip : `${quip}!`);
    })
    .catch(() => { /* the praise pool is always there */ })
    .finally(() => { quipInflight = false; });
}

export function takeQuip(problem: Problem): string | null {
  const key = problemKey(problem);
  const quip = quipPool.get(key) ?? null;
  quipPool.delete(key);
  if (quipPool.size > 8) quipPool.clear();
  return quip;
}
