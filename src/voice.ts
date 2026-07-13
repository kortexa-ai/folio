// The notebook's voice: the little brain wraps words around problems the
// deterministic generator has already computed. The model NEVER decides math —
// numbers and answers come from code, and every generation passes a strict
// validator or is discarded for the deterministic text. Everything here is
// prefetched during the learner's thinking time, so it never adds latency.

import { makeProblem, type Problem, type Topic } from './curriculum';
import { generate, isAwake } from './localTutor';
import { withIdentity } from './tutorPrompt';
import { logEvent } from './journal';

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
  if (!text || text.length > 60 || /\d/.test(text) || /[*#>`_:]/.test(text)) return null;
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
export function prefetchStory(topic: Topic, interests: string, name?: string): void {
  if (!isAwake() || !FLAVORABLE.has(topic.generator) || storyPool.has(topic.id) || storyInflight) return;
  storyInflight = true;
  const problem = makeProblem(topic);
  const user = `Story: ${problem.statement}\nNumbers that must appear unchanged: ${requiredNumbers(problem.statement).join(', ')}.` +
    (interests.trim() ? `\nThe child's favorite things: ${interests.trim()}.` : '') +
    (name?.trim() ? `\nYou may make ${name.trim()} the hero of the story.` : '') + '\nRetell it.';
  generate(withIdentity(REWRITE_SYSTEM, name), user, { maxNewTokens: 90, temperature: 0.8 }, 'retelling')
    .then(raw => {
      const story = acceptRewrite(problem.statement, problem.answer, raw);
      if (story) {
        const [hint1, hint2] = NEUTRAL_HINTS[topic.generator] ?? NEUTRAL_HINTS.default;
        storyPool.set(topic.id, { ...problem, statement: story, hint1, hint2 });
        logEvent('voice: story accepted');
      } else {
        logEvent(`voice: story rejected (${raw.trim().length} chars, ${(raw.match(/\d+/g) ?? []).length} numbers)`);
      }
    })
    .catch(error => logEvent(`voice: story generation failed — ${error instanceof Error ? error.message : String(error)}`))
    .finally(() => { storyInflight = false; });
}

/** Take (and consume) a prepared personalized problem for this topic. */
export function takeStory(topicId: string): Problem | null {
  const problem = storyPool.get(topicId) ?? null;
  storyPool.delete(topicId);
  return problem;
}

/** Quietly prepare a cheer for the moment this problem gets solved. */
export function prefetchQuip(problem: Problem, name?: string): void {
  if (!isAwake() || quipInflight) return;
  const key = problemKey(problem);
  if (quipPool.has(key)) return;
  quipInflight = true;
  generate(withIdentity(QUIP_SYSTEM, name), `The problem was: ${problem.statement} The child just got it right. Cheer once.`,
    { maxNewTokens: 24, temperature: 0.9 }, 'quip')
    .then(raw => {
      const quip = acceptQuip(raw);
      if (quip) {
        quipPool.set(key, quip.endsWith('.') || quip.endsWith('!') ? quip : `${quip}!`);
        logEvent('voice: quip accepted');
      } else {
        logEvent(`voice: quip rejected (${raw.trim().length} chars)`);
      }
    })
    .catch(error => logEvent(`voice: quip generation failed — ${error instanceof Error ? error.message : String(error)}`))
    .finally(() => { quipInflight = false; });
}

export function takeQuip(problem: Problem): string | null {
  const key = problemKey(problem);
  const quip = quipPool.get(key) ?? null;
  quipPool.delete(key);
  if (quipPool.size > 8) quipPool.clear();
  return quip;
}

// --- story pages (create mode) -------------------------------------------------
// The notebook co-writes: it opens a story, the child draws/writes their part in
// ink, and on request the notebook adds ONE beat — never two in a row, never an
// ending. With a cloud key the beat is grounded in a photo of the child's page.

export const CREATE_SYSTEM = `You are the voice of Folio, a magical paper notebook co-writing a tiny story with a young child.
Rules:
- Add exactly ONE story beat: one or two short sentences, at most 28 words.
- Simple, playful words a six-year-old knows. Warm, a little funny, never scary, sad, or violent.
- End mid-adventure with an opening for the child's next move. NEVER finish the story.
- The child adds their part by drawing and writing on paper; unless you are shown their page, leave generous room for whatever they imagined.
- Return only the story sentences. No labels, quotes, or markdown.`;

export const TOPICS_SYSTEM = `You are the voice of Folio, a magical paper notebook, offering a young child tiny wonder-topics to explore.
Reply with exactly three topics on one line, separated by commas. Each topic is 2 to 4 simple words, real and true (nature, animals, sky, machines, long ago). No numbering, no punctuation except the commas, nothing scary.`;

export const PASSAGE_SYSTEM = `You are the voice of Folio, a magical paper notebook, telling a young child one wondrous TRUE thing about a topic.
Rules:
- At most 55 simple words. True facts only — if unsure, choose a simpler true thing.
- Warm and amazed in tone. End with one small question to wonder about.
- No lists, no markdown, no scary or sad content. Return only the text.`;

const BANNED = /https?:|www\.|@|[*#>`_]/i;

/** A story beat the notebook may write on the page. */
export function acceptContribution(text: string): string | null {
  const clean = text.trim().replace(/^["'“‘]+|["'’”]+$/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length < 12 || clean.length > 220 || BANNED.test(clean)) return null;
  if (/the end\.?$/i.test(clean)) return null; // never finish the story
  return clean;
}

/** Three explore topics from one model line. */
export function acceptTopics(raw: string): string[] | null {
  const items = raw.replace(/\d+[.)]\s*/g, '').split(/[,\n·;]+/).map(t => t.trim().replace(/[."']/g, '')).filter(Boolean);
  const good = items.filter(t => t.length >= 3 && t.length <= 34 && !BANNED.test(t) && !/\d/.test(t));
  return good.length >= 3 ? good.slice(0, 3) : null;
}

/** A wonder-passage the notebook may write. */
export function acceptPassage(text: string): string | null {
  const clean = text.trim().replace(/^["'“‘]+|["'’”]+$/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length < 30 || clean.length > 420 || BANNED.test(clean)) return null;
  return clean;
}

const OPENINGS = [
  'Once upon a time, THING found something very odd behind the biggest cloud…',
  'One morning, THING woke up and everything was upside down…',
  'Deep in a pocket, THING discovered a door the size of a button…',
  'THING was drawing a map when the map started drawing back…',
  'On the quietest night of the year, THING heard a tiny knock…',
];
const CONTINUATIONS = [
  'And then — with a great WHOOSH — everything began to float. What floated highest?',
  'Suddenly a very small voice said: “Follow me. Bring a snack.” Where did it lead?',
  'Behind the next corner waited a surprise nobody had ever drawn before. What was it?',
  'Just then it started to rain — but not rain made of water. What fell from the sky?',
];
export const FALLBACK_TOPICS = ['volcanoes', 'the deep sea', 'why the moon changes shape', 'ants and their cities', 'how rainbows happen', 'dinosaurs with feathers', 'the tallest tree', 'castles long ago'];

const heroFrom = (interests: string, name: string | undefined, random: () => number) => {
  const loves = interests.split(',').map(s => s.trim()).filter(Boolean);
  if (name?.trim() && (!loves.length || random() < 0.5)) return name.trim();
  return loves.length ? `a small ${loves[Math.floor(random() * loves.length)].replace(/s$/, '')}` : 'a small brave someone';
};

export const fallbackOpening = (interests: string, name?: string, random = Math.random): string =>
  OPENINGS[Math.floor(random() * OPENINGS.length)].replace('THING', heroFrom(interests, name, random));

export const fallbackContinuation = (random = Math.random): string =>
  CONTINUATIONS[Math.floor(random() * CONTINUATIONS.length)];

export const fallbackTopics = (interests: string, random = Math.random): string[] => {
  const loves = interests.split(',').map(s => s.trim()).filter(s => s.length >= 3 && s.length <= 30);
  const pool = [...loves, ...FALLBACK_TOPICS];
  const picked: string[] = [];
  while (picked.length < 3 && pool.length) picked.push(...pool.splice(Math.floor(random() * pool.length), 1));
  return picked;
};

/** One locally generated story beat; falls back to the deterministic pool. */
export async function localContribution(storySoFar: string[], interests: string, name?: string): Promise<string> {
  if (isAwake()) {
    try {
      const user = `The story so far:\n${storySoFar.slice(-4).join('\n')}\n` +
        (interests.trim() ? `The child loves: ${interests.trim()}.\n` : '') +
        'The child has just added their own part in ink. Continue with the next beat.';
      const raw = await generate(withIdentity(CREATE_SYSTEM, name), user, { maxNewTokens: 60, temperature: 0.9 }, 'story beat');
      const beat = acceptContribution(raw);
      logEvent(beat ? 'voice: story beat accepted' : `voice: story beat rejected (${raw.trim().length} chars)`);
      if (beat) return beat;
    } catch (error) { logEvent(`voice: story beat failed — ${error instanceof Error ? error.message : String(error)}`); }
  }
  return fallbackContinuation();
}

/** Three locally generated wonder-topics; falls back to the deterministic pool. */
export async function localTopics(interests: string, name?: string): Promise<string[]> {
  if (isAwake()) {
    try {
      const raw = await generate(withIdentity(TOPICS_SYSTEM, name),
        interests.trim() ? `The child loves: ${interests.trim()}. Offer three topics.` : 'Offer three topics.',
        { maxNewTokens: 36, temperature: 0.9 }, 'topics');
      const topics = acceptTopics(raw);
      logEvent(topics ? 'voice: topics accepted' : `voice: topics rejected (${raw.trim().length} chars)`);
      if (topics) return topics;
    } catch (error) { logEvent(`voice: topics failed — ${error instanceof Error ? error.message : String(error)}`); }
  }
  return fallbackTopics(interests);
}

/** One locally generated wonder-passage, or null (the app then explains gently). */
export async function localPassage(topic: string, name?: string): Promise<string | null> {
  if (!isAwake()) return null;
  try {
    const raw = await generate(withIdentity(PASSAGE_SYSTEM, name), `The topic: ${topic}. Tell one wondrous true thing.`,
      { maxNewTokens: 90, temperature: 0.7 }, 'passage');
    const passage = acceptPassage(raw);
    logEvent(passage ? 'voice: passage accepted' : `voice: passage rejected (${raw.trim().length} chars)`);
    return passage;
  } catch (error) {
    logEvent(`voice: passage failed — ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
