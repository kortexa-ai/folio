// Curriculum backbone for Folio.
//
// Micro-topics and prerequisite edges below are extracted from the
// Marble Skill Taxonomy (v1) · © Generative Spark, Inc. (Marble)
// https://withmarble.com · https://github.com/withmarbleapp/os-taxonomy
// Database licensed under ODbL 1.0; textual content under CC BY-SA 4.0.
// See ATTRIBUTION.md. This file stands in for the publisher scaffold pipeline
// described in the concept document: generation happens INSIDE reviewed structure.

export type TopicType = 'CONCEPTUAL' | 'PROCEDURAL' | 'REPRESENTATIONAL' | 'LANGUAGE';
export type Topic = {
  id: string;
  type: TopicType;
  name: string;
  short: string;            // learner-facing chapter name (ours, not Marble's)
  description: string;
  evidence: string[];
  ageRangeStart: number;
  ageRangeEnd: number;
  standards: string[];
  generator: GeneratorKind;
};

export type Edge = { topicId: string; prerequisiteId: string; reason: string };

type GeneratorKind =
  | 'add-within-10' | 'subtract-within-10' | 'represent' | 'symbols'
  | 'bonds-to-10' | 'fluency-5' | 'word-10' | 'fluency-10'
  | 'within-20' | 'missing-number' | 'repeated-addition' | 'arrays' | 'times-tables';

// --- Taxonomy slice (verbatim fields from Marble Skill Taxonomy v1) ----------

export const TOPICS: Topic[] = [
  { id: 'mt_OvyoRo47K-', type: 'CONCEPTUAL', name: 'Addition as combining or putting together two', short: 'Putting together',
    description: 'Understand addition as combining or putting together two groups to find the total',
    evidence: ["Model 'putting together' with physical objects and say the total", "Act out an 'add to' situation (e.g. 3 children arrive, then 2 more join)", 'Explain that addition means finding how many altogether'],
    ageRangeStart: 4, ageRangeEnd: 6, standards: ['ccss-math:K.OA.1', 'uk-nc-2013:Maths/Y1/AS/1'], generator: 'add-within-10' },
  { id: 'mt_zuKAX6lcYR', type: 'CONCEPTUAL', name: 'Subtraction as taking away or separating', short: 'Taking away',
    description: 'Understand subtraction as taking away or separating from a group to find how many remain',
    evidence: ["Model 'taking away' with physical objects and say how many remain", "Act out a 'take from' situation (e.g. 5 biscuits, eat 2, how many left?)", 'Explain that subtraction means finding how many are left'],
    ageRangeStart: 4, ageRangeEnd: 6, standards: ['ccss-math:K.OA.1', 'uk-nc-2013:Maths/Y1/AS/1'], generator: 'subtract-within-10' },
  { id: 'mt_PgsHGYJMH-', type: 'REPRESENTATIONAL', name: 'Representing Addition and Subtraction', short: 'Show it with drawings',
    description: 'Represent addition and subtraction using objects, drawings, and mental images',
    evidence: ['Use cubes or counters to show 3 + 2', 'Draw a picture to represent a subtraction situation', 'Use fingers to model an addition problem'],
    ageRangeStart: 4, ageRangeEnd: 6, standards: ['ccss-math:K.OA.1', 'uk-nc-2013:Maths/Y1/AS/4'], generator: 'represent' },
  { id: 'mt_8RmpkDxT9L', type: 'LANGUAGE', name: 'Reading +, −, and = symbols', short: 'Math symbols',
    description: 'Read, write, and interpret the symbols +, −, and = in number sentences',
    evidence: ["Read 3 + 2 = 5 aloud as 'three plus two equals five'", 'Write a number sentence to match a concrete addition situation', "Interpret the = sign as 'is the same as' rather than just 'the answer is'"],
    ageRangeStart: 5, ageRangeEnd: 6, standards: ['ccss-math:K.OA.1', 'uk-nc-2013:Maths/Y1/AS/1'], generator: 'symbols' },
  { id: 'mt_e8CZ7E5qW7', type: 'PROCEDURAL', name: 'Number bonds to 9', short: 'Making ten',
    description: 'Find the number that makes 10 when added to a given number from 1 to 9 (number bonds to 10)',
    evidence: ["Given 7, respond '3' to make 10", 'Use a ten-frame to find the complement to 10', 'Record pairs that make 10 as equations (e.g. 6 + 4 = 10)'],
    ageRangeStart: 4, ageRangeEnd: 6, standards: ['ccss-math:K.OA.4', 'uk-nc-2013:Maths/Y1/AS/2'], generator: 'bonds-to-10' },
  { id: 'mt_ghF3Vv6taM', type: 'PROCEDURAL', name: 'Fluent adding and subtracting within 5', short: 'Quick facts to 5',
    description: 'Fluently add and subtract within 5',
    evidence: ['Answer 2 + 3 quickly without counting on fingers', 'Answer 5 – 2 from recall or with minimal counting', 'Complete a set of within-5 addition/subtraction facts accurately and quickly'],
    ageRangeStart: 5, ageRangeEnd: 6, standards: ['ccss-math:K.OA.5'], generator: 'fluency-5' },
  { id: 'mt_yJmvUCCym7', type: 'PROCEDURAL', name: 'Addition and subtraction word problems', short: 'Story problems',
    description: 'Solve addition and subtraction word problems within 10 using objects or drawings',
    evidence: ["Solve 'There are 6 apples, 2 are eaten, how many left?' using counters", "Solve 'add to' and 'take from' result-unknown problems", "Solve 'put together/take apart' problems with total unknown"],
    ageRangeStart: 4, ageRangeEnd: 6, standards: ['ccss-math:K.OA.2', 'uk-nc-2013:Maths/Y1/AS/4'], generator: 'word-10' },
  { id: 'mt__we2TDqnJx', type: 'PROCEDURAL', name: 'Fluent adding and subtracting within 10', short: 'Quick facts to 10',
    description: 'Fluently add and subtract within 10',
    evidence: ['Answer within-10 addition facts from memory', 'Answer within-10 subtraction facts from memory', 'Use known facts to derive unknown ones'],
    ageRangeStart: 6, ageRangeEnd: 7, standards: ['ccss-math:1.OA.6'], generator: 'fluency-10' },
  { id: 'mt_m1W6nTQJ2b', type: 'PROCEDURAL', name: 'Addition and subtraction within 20', short: 'Crossing ten',
    description: 'Add and subtract within 20, using strategies such as making ten',
    evidence: ['Use making-ten to solve 8 + 5', 'Use known doubles to derive near-doubles', 'Subtract within 20 by counting up or back'],
    ageRangeStart: 6, ageRangeEnd: 7, standards: ['ccss-math:1.OA.6', 'uk-nc-2013:Maths/Y2/AS/1'], generator: 'within-20' },
  { id: 'mt_ezc2m_0dzN', type: 'CONCEPTUAL', name: 'Finding a missing number in addition', short: 'The missing number',
    description: 'Find the unknown number in addition and subtraction equations',
    evidence: ['Solve 5 + ? = 9', 'Solve ? − 3 = 4', 'Explain the unknown-addend relationship between addition and subtraction'],
    ageRangeStart: 6, ageRangeEnd: 7, standards: ['ccss-math:1.OA.8', 'uk-nc-2013:Maths/Y2/AS/2'], generator: 'missing-number' },
  { id: 'mt_PZ909yPrEC', type: 'CONCEPTUAL', name: 'Multiplication as repeated addition', short: 'Making groups',
    description: 'Understand multiplication as repeated addition of equal groups',
    evidence: ['Show 3 × 4 as 4 + 4 + 4', 'Group counters into equal sets and find the total', 'Write a multiplication sentence for a repeated-addition situation'],
    ageRangeStart: 5, ageRangeEnd: 6, standards: ['ccss-math:2.OA.4', 'uk-nc-2013:Maths/Y1/MD/1'], generator: 'repeated-addition' },
  { id: 'mt_GRWwTDZ3wD', type: 'REPRESENTATIONAL', name: 'Arrays for multiplication', short: 'Rows and columns',
    description: 'Use arrays of rows and columns to represent and solve multiplication',
    evidence: ['Build an array for 3 × 5', 'Count an array by rows to find the product', 'Match an array to its multiplication sentence'],
    ageRangeStart: 5, ageRangeEnd: 6, standards: ['ccss-math:2.OA.4'], generator: 'arrays' },
  { id: 'mt_HhuSDxwDNM', type: 'PROCEDURAL', name: 'Times tables', short: 'Times tables',
    description: 'Recall multiplication facts for the 2, 5, and 10 times tables',
    evidence: ['Recall 2× facts quickly', 'Recall 5× facts quickly', 'Recall 10× facts quickly'],
    ageRangeStart: 6, ageRangeEnd: 7, standards: ['uk-nc-2013:Maths/Y2/MD/1'], generator: 'times-tables' },
];

export const EDGES: Edge[] = [
  { topicId: 'mt_8RmpkDxT9L', prerequisiteId: 'mt_OvyoRo47K-', reason: 'Reading/writing the + symbol requires understanding what addition means' },
  { topicId: 'mt_8RmpkDxT9L', prerequisiteId: 'mt_zuKAX6lcYR', reason: 'Reading/writing the − symbol requires understanding what subtraction means' },
  { topicId: 'mt_PgsHGYJMH-', prerequisiteId: 'mt_OvyoRo47K-', reason: 'Representing addition with objects/drawings requires understanding what addition means' },
  { topicId: 'mt_PgsHGYJMH-', prerequisiteId: 'mt_zuKAX6lcYR', reason: 'Representing subtraction with objects/drawings requires understanding what subtraction means' },
  { topicId: 'mt_ghF3Vv6taM', prerequisiteId: 'mt_OvyoRo47K-', reason: 'Fluency with addition within 5 requires understanding addition as combining' },
  { topicId: 'mt_ghF3Vv6taM', prerequisiteId: 'mt_zuKAX6lcYR', reason: 'Fluency with subtraction within 5 requires understanding subtraction as taking away' },
  { topicId: 'mt_yJmvUCCym7', prerequisiteId: 'mt_PgsHGYJMH-', reason: 'Solving word problems within 10 requires ability to represent the operations with objects/drawings' },
  { topicId: 'mt__we2TDqnJx', prerequisiteId: 'mt_e8CZ7E5qW7', reason: 'Fluency within 10 requires knowing number bonds to 10' },
  { topicId: 'mt__we2TDqnJx', prerequisiteId: 'mt_ghF3Vv6taM', reason: 'Fluency within 10 extends from fluency within 5' },
  { topicId: 'mt_m1W6nTQJ2b', prerequisiteId: 'mt_e8CZ7E5qW7', reason: 'Making-ten strategy requires knowing bonds to 10' },
  { topicId: 'mt_m1W6nTQJ2b', prerequisiteId: 'mt__we2TDqnJx', reason: 'Strategies for within-20 calculation build on fluent within-10 knowledge' },
  { topicId: 'mt_ezc2m_0dzN', prerequisiteId: 'mt_OvyoRo47K-', reason: 'Unknown-addend requires understanding both addition and subtraction' },
  { topicId: 'mt_ezc2m_0dzN', prerequisiteId: 'mt_zuKAX6lcYR', reason: 'Subtraction as unknown-addend reframes subtraction conceptually' },
  { topicId: 'mt_PZ909yPrEC', prerequisiteId: 'mt_OvyoRo47K-', reason: 'Multiplication as repeated addition requires understanding addition as combining groups' },
  { topicId: 'mt_GRWwTDZ3wD', prerequisiteId: 'mt_PZ909yPrEC', reason: 'Using arrays requires understanding what multiplication means' },
  { topicId: 'mt_HhuSDxwDNM', prerequisiteId: 'mt_PZ909yPrEC', reason: 'Recalling times table facts requires understanding multiplication as repeated addition/grouping' },
];

export const topicById = new Map(TOPICS.map(t => [t.id, t]));

// --- Mastery model -----------------------------------------------------------
// Each topic carries a decaying memory strength (spaced review resurfaces
// topics as they fade), a short outcome history (struggle detection), and
// time-on-task — the seed of the parent/teacher view in the concept doc.

export type Outcome = { c: 0 | 1; h: number; t: number };  // correct?, hints used, when
export type TopicMastery = {
  attempts: number; correct: number; streak: number; lastSeen: number;
  strength: number;        // 0..1 memory strength at lastSeen
  hints: number;           // total hints asked on this topic
  ms: number;              // time-on-task, capped per page
  history: Outcome[];      // last few outcomes, newest last
};
export type Mastery = Record<string, TopicMastery>;

export const MASTERY_STREAK = 4;
const HISTORY_KEEP = 8;
const PAGE_MS_CAP = 5 * 60_000;
const DAY = 24 * 3_600_000;

export const freshTopicMastery = (): TopicMastery =>
  ({ attempts: 0, correct: 0, streak: 0, lastSeen: 0, strength: 0, hints: 0, ms: 0, history: [] });

export const isMastered = (m?: TopicMastery) => !!m && (m.streak >= MASTERY_STREAK || (m.correct >= 6 && m.correct / m.attempts >= 0.8));

/** Memory strength now: exponential decay whose half-life grows with practice. */
export function effectiveStrength(m: TopicMastery, now = Date.now()): number {
  if (!m.lastSeen) return m.strength;
  const halfLifeDays = Math.min(2 + m.correct * 1.5, 30);
  return m.strength * Math.pow(2, -((now - m.lastSeen) / DAY) / halfLifeDays);
}

/** A mastered topic whose memory has faded is due for a gentle review. */
export const isReviewDue = (m: TopicMastery | undefined, now = Date.now()): boolean =>
  !!m && isMastered(m) && effectiveStrength(m, now) < 0.55;

/** Mostly-wrong lately (≥4 misses in the last 6 outcomes) → this topic hurts. */
export const isStruggling = (m?: TopicMastery): boolean =>
  !!m && m.history.slice(-6).filter(o => o.c === 0).length >= 4;

export const isUnlocked = (topicId: string, mastery: Mastery) =>
  EDGES.filter(e => e.topicId === topicId).every(e => isMastered(mastery[e.prerequisiteId]));

export function unlockedTopics(mastery: Mastery): Topic[] {
  return TOPICS.filter(t => isUnlocked(t.id, mastery));
}

/**
 * Pick what to work on:
 *  1. if the current work hurts, sometimes flip back for a warm-up on its weakest prerequisite;
 *  2. sometimes serve a review of the most-faded mastered topic that is due;
 *  3. otherwise the easiest unmastered unlocked topic.
 */
export function chooseTopic(mastery: Mastery, random = Math.random, now = Date.now()): Topic {
  const unlocked = unlockedTopics(mastery);
  const fresh = unlocked
    .filter(t => !isMastered(mastery[t.id]))
    .sort((a, b) => a.ageRangeStart - b.ageRangeStart || a.ageRangeEnd - b.ageRangeEnd);
  const struggling = fresh.find(t => isStruggling(mastery[t.id]));
  if (struggling && random() < 0.35) {
    const warmups = EDGES.filter(e => e.topicId === struggling.id)
      .map(e => topicById.get(e.prerequisiteId)!)
      .filter(t => isMastered(mastery[t.id]))
      .sort((a, b) => effectiveStrength(mastery[a.id], now) - effectiveStrength(mastery[b.id], now));
    if (warmups.length) return warmups[0];
  }
  const due = unlocked
    .filter(t => isReviewDue(mastery[t.id], now))
    .sort((a, b) => effectiveStrength(mastery[a.id], now) - effectiveStrength(mastery[b.id], now));
  if (due.length && (fresh.length === 0 || random() < 0.35)) return due[0];
  // Interleave: drilling one chapter page after page reads as "it keeps asking
  // the same thing" — when several chapters are open, sometimes visit another.
  if (fresh.length > 1 && random() < 0.3) {
    return fresh[1 + Math.floor(random() * (fresh.length - 1))];
  }
  return fresh[0] ?? unlocked[0] ?? TOPICS[0];
}

export function recordAttempt(
  mastery: Mastery, topicId: string, correct: boolean, firstTry: boolean,
  extra: { hints?: number; ms?: number; now?: number } = {},
): Mastery {
  const now = extra.now ?? Date.now();
  const m = { ...(mastery[topicId] ?? freshTopicMastery()) };
  m.attempts += 1;
  m.lastSeen = now;
  m.hints += extra.hints ?? 0;
  m.ms += Math.min(extra.ms ?? 0, PAGE_MS_CAP);
  if (correct) {
    m.correct += 1;
    m.streak = firstTry ? m.streak + 1 : m.streak;
    m.strength = Math.min(1, m.strength + (firstTry ? 0.25 : 0.15));
  } else {
    m.streak = 0;
    m.strength = Math.max(0, m.strength - 0.2);
  }
  m.history = [...m.history, { c: correct ? 1 : 0 as 0 | 1, h: extra.hints ?? 0, t: now }].slice(-HISTORY_KEEP);
  return { ...mastery, [topicId]: m };
}

// --- Problem generation ------------------------------------------------------
// Every problem is instantiated fresh from a topic scaffold — never a fixed bank.

export type Problem = {
  topicId: string;
  kind: 'equation' | 'story' | 'missing';
  statement: string;          // learner-facing text (story) or spoken form
  equation?: string;          // rendered big when present, '□' marks the unknown
  answer: number;
  hint1: string;
  hint2: string;
  scaffold: LearningScaffold;
};

export type LearningScaffold =
  | { kind: 'combine'; groups: [number, number] }
  | { kind: 'take-away'; total: number; remove: number }
  | { kind: 'ten-frame'; filled: number }
  | { kind: 'count-on'; start: number; end: number }
  | { kind: 'equal-groups'; groups: number; each: number };

/** The symbolic idea Folio writes back after the learner has solved the page. */
export const completedEquation = (problem: Problem): string => {
  if (problem.equation) return problem.equation.replace('□', String(problem.answer));
  const model = problem.scaffold;
  if (model.kind === 'combine') return `${model.groups[0]} + ${model.groups[1]} = ${problem.answer}`;
  if (model.kind === 'take-away') return `${model.total} − ${model.remove} = ${problem.answer}`;
  if (model.kind === 'ten-frame') return `${model.filled} + ${problem.answer} = 10`;
  if (model.kind === 'count-on') return `${model.start} + ${problem.answer} = ${model.end}`;
  return `${model.groups} × ${model.each} = ${problem.answer}`;
};

const NAMES = ['Maya', 'Leo', 'Ada', 'Kofi', 'Nina', 'Sam', 'Iris', 'Omar'];
const THINGS = [
  { one: 'apple', many: 'apples' }, { one: 'toy car', many: 'toy cars' },
  { one: 'sticker', many: 'stickers' }, { one: 'biscuit', many: 'biscuits' },
  { one: 'marble', many: 'marbles' }, { one: 'strawberry', many: 'strawberries' },
  { one: 'crayon', many: 'crayons' }, { one: 'shell', many: 'shells' },
];

const ri = (lo: number, hi: number, r: () => number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)];

/** What makes two problem instances "the same page" in a child's eyes. */
export const problemSignature = (p: Problem): string => p.equation ?? p.statement;

/**
 * A fresh problem that isn't one of the recently seen instances. Small
 * parameter spaces (nine bonds to ten…) repeat quickly under pure chance,
 * and children spot "it asked me 8 + 2 again" immediately.
 */
export function makeProblem(topic: Topic, random = Math.random, avoid?: ReadonlySet<string>): Problem {
  let problem = generateProblem(topic, random);
  for (let i = 0; i < 12 && avoid?.has(problemSignature(problem)); i++) {
    problem = generateProblem(topic, random);
  }
  return problem;
}

function generateProblem(topic: Topic, random: () => number): Problem {
  const r = random;
  const name = pick(NAMES, r);
  const thing = pick(THINGS, r);
  switch (topic.generator) {
    case 'add-within-10': {
      const a = ri(1, 6, r), b = ri(1, Math.min(9 - a, 4) || 1, r);
      return { topicId: topic.id, kind: 'story', answer: a + b, statement:
        `${name} has ${a} ${a === 1 ? thing.one : thing.many}. A friend brings ${b} more. How many ${thing.many} altogether?`,
        hint1: `Draw ${a} dots for ${name}'s ${thing.many}, then ${b} more dots.`, hint2: `Count all the dots together, starting at ${a}.`,
        scaffold: { kind: 'combine', groups: [a, b] } };
    }
    case 'subtract-within-10': {
      const a = ri(3, 9, r), b = ri(1, a - 1, r);
      return { topicId: topic.id, kind: 'story', answer: a - b, statement:
        `${name} has ${a} ${thing.many} and gives ${b} away. How many ${thing.many} are left?`,
        hint1: `Draw ${a} marks, then cross out ${b}.`, hint2: `Count the marks that are not crossed out.`,
        scaffold: { kind: 'take-away', total: a, remove: b } };
    }
    case 'represent': {
      const add = r() < 0.5; const a = ri(2, 6, r), b = ri(1, add ? 9 - a : a - 1, r);
      return { topicId: topic.id, kind: 'story', answer: add ? a + b : a - b, statement: add
        ? `Draw a picture on the page: ${a} ${thing.many}, then ${b} more arrive. Write how many there are now.`
        : `Draw a picture on the page: ${a} ${thing.many}, then ${b} get eaten. Write how many are left.`,
        hint1: `Circles or sticks are fine — the drawing is the thinking.`, hint2: add ? `Count every ${thing.one} you drew.` : `Cross out the ones that got eaten, then count the rest.`,
        scaffold: add ? { kind: 'combine', groups: [a, b] } : { kind: 'take-away', total: a, remove: b } };
    }
    case 'symbols': {
      const a = ri(1, 6, r), b = ri(1, 9 - a, r); const sub = r() < 0.4;
      const eq = sub ? `${a + b} − ${b} = □` : `${a} + ${b} = □`;
      return { topicId: topic.id, kind: 'equation', equation: eq, answer: sub ? a : a + b,
        statement: sub ? `${a + b} minus ${b} equals what?` : `${a} plus ${b} equals what?`,
        hint1: `Read it out loud: "${sub ? `${a + b} take away ${b}` : `${a} and ${b} more`}".`, hint2: `The = sign means "is the same as". What number makes both sides the same?`,
        scaffold: sub ? { kind: 'take-away', total: a + b, remove: b } : { kind: 'combine', groups: [a, b] } };
    }
    case 'bonds-to-10': {
      const a = ri(1, 9, r);
      return { topicId: topic.id, kind: 'missing', equation: `${a} + □ = 10`, answer: 10 - a,
        statement: `${a} and how many more make 10?`,
        hint1: `Picture a ten-frame with ${a} filled in. How many boxes are empty?`, hint2: `Count up from ${a} to 10 on your fingers.`,
        scaffold: { kind: 'ten-frame', filled: a } };
    }
    case 'fluency-5': {
      const add = r() < 0.5; const a = ri(1, 4, r), b = ri(1, add ? 5 - a : a, r);
      return { topicId: topic.id, kind: 'equation', equation: add ? `${a} + ${b} = □` : `${a + b} − ${b} = □`,
        answer: add ? a + b : a, statement: 'Quick one — try it from memory.',
        hint1: `You know this one. Say it out loud first.`, hint2: add ? `Start at ${a} and count ${b} more.` : `Count back ${b} from ${a + b}.`,
        scaffold: add ? { kind: 'combine', groups: [a, b] } : { kind: 'take-away', total: a + b, remove: b } };
    }
    case 'word-10': {
      const style = ri(0, 2, r); const a = ri(2, 7, r), b = ri(1, Math.min(9 - a, a), r) || 1;
      if (style === 0) return { topicId: topic.id, kind: 'story', answer: a + b, statement:
        `There are ${a} ${thing.many} in a bowl and ${b} on the table. How many ${thing.many} are there in all?`,
        hint1: `Draw the bowl group and the table group.`, hint2: `Put the two groups together and count.`,
        scaffold: { kind: 'combine', groups: [a, b] } };
      if (style === 1) return { topicId: topic.id, kind: 'story', answer: a - Math.min(b, a - 1), statement:
        `${name} had ${a} ${thing.many}. ${Math.min(b, a - 1)} rolled away. How many ${thing.many} does ${name} have now?`,
        hint1: `Draw ${a} ${thing.many} and cross out the ones that rolled away.`, hint2: `Count what's left.`,
        scaffold: { kind: 'take-away', total: a, remove: Math.min(b, a - 1) } };
      return { topicId: topic.id, kind: 'story', answer: b, statement:
        `${name} has ${a + b} ${thing.many}. ${a} are red and the rest are green. How many are green?`,
        hint1: `Draw ${a + b} circles. Colour ${a} of them red.`, hint2: `The circles you didn't colour are the green ones — count them.`,
        scaffold: { kind: 'take-away', total: a + b, remove: a } };
    }
    case 'fluency-10': {
      const add = r() < 0.5; const a = ri(2, 8, r), b = ri(1, add ? 10 - a : a - 1, r);
      return { topicId: topic.id, kind: 'equation', equation: add ? `${a} + ${b} = □` : `${a} − ${b} = □`,
        answer: add ? a + b : a - b, statement: 'From memory if you can.',
        hint1: `Do you know a fact that's close to this one?`, hint2: add ? `Count on from the bigger number, ${Math.max(a, b)}.` : `Count back ${b} from ${a}.`,
        scaffold: add ? { kind: 'combine', groups: [a, b] } : { kind: 'take-away', total: a, remove: b } };
    }
    case 'within-20': {
      const a = ri(6, 9, r), b = ri(11 - a, 9, r);
      return { topicId: topic.id, kind: 'equation', equation: `${a} + ${b} = □`, answer: a + b,
        statement: `Try making ten first.`,
        hint1: `${a} needs ${10 - a} to make 10. Take ${10 - a} from ${b}.`, hint2: `10 and ${b - (10 - a)} left over — put them together.`,
        scaffold: { kind: 'combine', groups: [a, b] } };
    }
    case 'missing-number': {
      const a = ri(2, 8, r), b = ri(1, 9 - a, r); const first = r() < 0.5;
      return { topicId: topic.id, kind: 'missing', equation: first ? `□ + ${b} = ${a + b}` : `${a} + □ = ${a + b}`,
        answer: first ? a : b, statement: `What number is hiding in the box?`,
        hint1: `Think of it backwards: ${a + b} take away ${first ? b : a}.`, hint2: `Count up from ${first ? b : a} to ${a + b}. How many jumps?`,
        scaffold: { kind: 'count-on', start: first ? b : a, end: a + b } };
    }
    case 'repeated-addition': {
      const groups = ri(2, 4, r), each = ri(2, 5, r);
      return { topicId: topic.id, kind: 'story', answer: groups * each, statement:
        `${name} makes ${groups} groups of ${thing.many}, with ${each} in each group. How many ${thing.many} in total?`,
        hint1: `Draw ${groups} circles and put ${each} dots in each.`, hint2: `That's ${Array(groups).fill(each).join(' + ')}. Add them up.`,
        scaffold: { kind: 'equal-groups', groups, each } };
    }
    case 'arrays': {
      const rows = ri(2, 4, r), cols = ri(2, 5, r);
      return { topicId: topic.id, kind: 'story', answer: rows * cols, statement:
        `Draw an array: ${rows} rows with ${cols} dots in each row. How many dots did you draw?`,
        hint1: `Line the dots up neatly — rows across, columns down.`, hint2: `Count one row (${cols}), then add it for every row.`,
        scaffold: { kind: 'equal-groups', groups: rows, each: cols } };
    }
    case 'times-tables': {
      const table = pick([2, 5, 10], r), n = ri(2, 9, r);
      return { topicId: topic.id, kind: 'equation', equation: `${table} × ${n} = □`, answer: table * n,
        statement: `${table} times ${n}.`,
        hint1: table === 10 ? `Ten times is the number with a zero after it.` : `Count in ${table}s: ${table}, ${table * 2}, ${table * 3}…`,
        hint2: `That's ${n} groups of ${table}. Draw them if it helps.`,
        scaffold: { kind: 'equal-groups', groups: n, each: table } };
    }
  }
}

export const formatForTutor = (p: Problem) =>
  p.equation ? `${p.equation.replace('□', '?')}${p.kind === 'story' ? ` — ${p.statement}` : ''}` : p.statement;
