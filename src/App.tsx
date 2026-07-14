import { useEffect, useRef, useState } from 'react';
import { InkPad, type InkPadHandle } from './InkPad';
import { chooseTopic, formatForTutor, isMastered, isReviewDue, isStruggling, isUnlocked, makeProblem, MASTERY_STREAK, problemSignature, recordAttempt, TOPICS, type Problem, type Topic } from './curriculum';
import { alternatives, isConfident, isLegible, recognizeNumber, type Stroke } from './recognizer';
import { getLocalHint, isAwake, loadTutor, MODEL_ID, sleepTutor, tookDownLastSession } from './localTutor';
import { acceptContribution, acceptPassage, CREATE_SYSTEM, fallbackOpening, localContribution, localPassage, localTopics, PASSAGE_SYSTEM, prefetchQuip, prefetchStory, takeQuip, takeStory } from './voice';
import { activeBrain, askCloud, CHAT_PROVIDERS, FAL_DEFAULT_MODEL, generateIllustration, imageProvider, loadCloudSettings, saveCloudSettings, type CloudSettings, type ProviderId } from './cloud';
import { CLOUD_SYSTEM_PROMPT, withIdentity } from './tutorPrompt';
import { daysWritten, downloadProgress, freshProgress, loadProgress, parseProgressExport, saveProgress, touchSession, type Progress } from './storage';
import { clearJournal, journalReport, logEvent, readJournal } from './journal';

type Note = { tone: 'welcome' | 'muse' | 'good' | 'gentle' | 'thinking'; text: string; alts?: number[] };
type Mode = 'practice' | 'create' | 'explore';

const WELCOME_BODY = "Write anywhere on me: work things out, scribble, cross out. Circle an answer when you're sure — or use the little pencil tray below for undo, a hint, or to hand it in.";
const WELCOME = `Hello — I'm Folio, your notebook. ${WELCOME_BODY}`;
const PRAISE = ['Yes — exactly right.', "That's the one. Lovely.", 'Beautifully done.', 'Quite right, quite right.', 'You found it.', 'My favorite kind of page.'];
const NUDGE = ['Hmm, not quite yet. Look at it once more.', "Not this one — but you're close. Try again.", 'Almost. Check your counting, slowly.'];
const IDLE_NUDGE: Record<Problem['kind'], string> = {
  story: 'You can draw the story right on me — dots and sticks count.',
  equation: 'Try counting out loud, or draw some dots to help.',
  missing: 'What number makes both sides match? Try one in pencil.',
};
const MODE_LABEL: Record<Mode, string> = { practice: 'practice', create: 'story pages', explore: 'wonder pages' };
const LEGEND: Record<Mode, string> = {
  practice: 'circle your answer  ·  draw ? for a hint  ·  scribble to erase',
  create: 'draw & write your part  ·  ? = my turn  ·  scribble to erase',
  explore: 'tap a wonder  ·  draw ? for new ones  ·  scribble to erase',
};

/** Text that appears letter by letter, like ink soaking into the page. */
function Handwrite({ text }: { text: string }) {
  let i = 0;
  return <span className="handwrite" aria-label={text}>
    {text.split(' ').map((word, w) => (
      <span className="hw-word" key={w} aria-hidden>
        {[...word].map((ch, c) => <span className="hw-ch" key={c} style={{ animationDelay: `${Math.min(i++ * 24, 2400)}ms` }}>{ch}</span>)}
      </span>
    ))}
  </span>;
}

const illustrationPrompt = (problem: Problem) => {
  // Drop the question and blur the counts — a drawing with the wrong number
  // of apples would quietly contradict the math.
  const scene = problem.statement.replace(/[^.!]*\?\s*$/, '').trim().replace(/\b\d+\b/g, 'some');
  return `A child's small crayon drawing in the corner of a paper notebook: ${scene} Sweet, simple shapes, warm colors, plain cream paper background. No words, letters, or numbers.`;
};

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [topic, setTopic] = useState<Topic>(() => chooseTopic(loadProgress().mastery));
  const [problem, setProblem] = useState<Problem>(() => makeProblem(topic));
  const [learner, setLearner] = useState(() => localStorage.getItem('folio-name') ?? '');
  const [intro, setIntro] = useState<'name' | 'brain' | null>(() =>
    loadProgress().attempts === 0 && !localStorage.getItem('folio-name') ? 'name' : null);
  const [nameDraft, setNameDraft] = useState('');
  const [mode, setMode] = useState<Mode>('practice');
  const [modeMenu, setModeMenu] = useState(false);
  const [story, setStory] = useState<string[]>([]);
  const [storyBusy, setStoryBusy] = useState(false);
  const [exploreTopics, setExploreTopics] = useState<string[]>([]);
  const [explorePassage, setExplorePassage] = useState<string | null>(null);
  const [exploreBusy, setExploreBusy] = useState(false);
  const [note, setNote] = useState<Note>(() => loadProgress().attempts === 0
    ? { tone: 'welcome', text: WELCOME }
    : { tone: 'muse', text: 'Welcome back — I kept your place.' });
  const [tries, setTries] = useState(0);
  const [hints, setHints] = useState(0);
  const [lastRead, setLastRead] = useState<number | null>(null);
  const [clearSignal, setClearSignal] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const [panel, setPanel] = useState<'none' | 'settings' | 'contents'>('none');
  const [eink, setEink] = useState(() => localStorage.getItem('folio-eink') === 'true');
  const [flash, setFlash] = useState(false);
  const [flourish, setFlourish] = useState(false);
  const [cloud, setCloud] = useState<CloudSettings>(loadCloudSettings);
  const [interests, setInterests] = useState(() => localStorage.getItem('folio-interests') ?? '');
  const [art, setArt] = useState<string | null>(null);
  const [brainOn, setBrainOn] = useState(() => localStorage.getItem('folio-brain') === 'on');
  const [modelStatus, setModelStatus] = useState<'off' | 'loading' | 'ready' | 'error'>('off');
  const [modelMessage, setModelMessage] = useState('');
  const [resetArmed, setResetArmed] = useState(false);
  const [importError, setImportError] = useState('');
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalCopied, setJournalCopied] = useState<'idle' | 'copied' | 'manual'>('idle');
  const locked = useRef(false);
  const pageShownAt = useRef(Date.now());
  const idleTimer = useRef(0);
  const resetTimer = useRef(0);
  const pad = useRef<InkPadHandle>(null);
  const recentPages = useRef<Record<string, string[]>>({}); // last few problem signatures per topic
  // Ambient generation pacing: the lab generates once per human action; a
  // burst of back-to-back background generations right after wake is exactly
  // when iOS reclaims the tab. Phones get no ambient generation at all —
  // the brain still answers every user-initiated ask (hints, beats, wonders).
  const ambientBrain = useRef(typeof window !== 'undefined' && window.innerWidth >= 680);
  const ambientNoteLogged = useRef(false);
  const lastPrefetchAt = useRef(Date.now());
  const prefetchFlip = useRef(false);
  // creative/explore time bookkeeping (batched into progress on flush)
  const strokesSinceBeat = useRef(0);
  const lastInkAt = useRef(0);
  const consumeStart = useRef(0);
  const exploreStart = useRef(0);
  const pendingCreate = useRef(0);
  const pendingConsume = useRef(0);

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => {
    document.documentElement.dataset.eink = String(eink);
    localStorage.setItem('folio-eink', String(eink));
  }, [eink]);

  const enableModel = async () => {
    setModelStatus('loading');
    try {
      await loadTutor(setModelMessage);
      setModelStatus('ready');
      setModelMessage('Awake, and already reading over your shoulder.');
    } catch (error) {
      setModelStatus('error');
      setModelMessage(error instanceof Error ? error.message : 'Could not load the local tutor.');
    }
  };

  // The little brain wakes with the notebook once it has been invited — but
  // gently: a moment after first paint, never without WebGPU, and never right
  // after it took the whole page down (the crash-loop guard skips one wake and
  // leaves the decision to a person).
  useEffect(() => {
    if (!brainOn || modelStatus !== 'off') return;
    if (tookDownLastSession()) {
      logEvent('brain: crash-guard tripped — previous session died with the brain awake; auto-wake skipped');
      setBrainOn(false);
      localStorage.removeItem('folio-brain');
      setModelStatus('error');
      setModelMessage('Waking the little brain seemed too heavy for this device last time, so I let it sleep. Turn it back on to try again.');
      return;
    }
    if (!('gpu' in navigator)) {
      setModelStatus('error');
      setModelMessage('This browser has no WebGPU, so the little brain stays asleep here.');
      return;
    }
    const timer = window.setTimeout(() => void enableModel(), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brainOn]);

  // Each new practice page: start the clock, remember the page so it doesn't
  // repeat soon, arm the idle whisper, and let the brain prepare tomorrow's
  // words while the learner thinks.
  useEffect(() => {
    if (intro || mode !== 'practice') return;
    pageShownAt.current = Date.now();
    const seen = (recentPages.current[problem.topicId] ??= []);
    const signature = problemSignature(problem);
    if (!seen.includes(signature)) { seen.push(signature); if (seen.length > 4) seen.shift(); }
    if (modelStatus === 'ready' && ambientBrain.current) {
      // At most ONE background generation per page, never more often than
      // every 12s, alternating between a cheer and a retelling.
      const now = Date.now();
      if (now - lastPrefetchAt.current >= 12_000) {
        lastPrefetchAt.current = now;
        if (prefetchFlip.current) prefetchQuip(problem, learner);
        else prefetchStory(chooseTopic(progress.mastery), interests, learner);
        prefetchFlip.current = !prefetchFlip.current;
      }
    } else if (modelStatus === 'ready' && !ambientNoteLogged.current) {
      ambientNoteLogged.current = true;
      logEvent('voice: ambient prefetch disabled (small screen) — the brain answers only when asked');
    }
    clearTimeout(idleTimer.current);
    const delay = Number(localStorage.getItem('folio-idle-ms')) || 40_000;
    idleTimer.current = window.setTimeout(() => {
      if (!locked.current) setNote(n => (n.tone === 'good' || n.tone === 'thinking') ? n : { tone: 'muse', text: IDLE_NUDGE[problem.kind] });
    }, delay);
    return () => clearTimeout(idleTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem, modelStatus, mode, intro]);

  // A little taped-in drawing for story pages, when a picture key is configured.
  useEffect(() => {
    if (mode !== 'practice') return;
    setArt(null);
    if (intro || problem.kind !== 'story' || !cloud.illustrations || !imageProvider(cloud)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const url = await generateIllustration(cloud, illustrationPrompt(problem));
        if (!cancelled && url) setArt(url);
      } catch { /* the page simply stays unillustrated */ }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem, mode, intro]);

  // Opening/closing a panel always disarms the reset, clears stale errors, and
  // flushes creative/explore time so the grown-ups numbers are current.
  useEffect(() => { setResetArmed(false); setImportError(''); setJournalOpen(false); setJournalCopied('idle'); clearTimeout(resetTimer.current); flushModeTime(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [panel]);

  const updateCloud = (mutate: (next: CloudSettings) => void) => setCloud(current => {
    const next: CloudSettings = { ...current, keys: { ...current.keys }, models: { ...current.models } };
    mutate(next);
    saveCloudSettings(next);
    return next;
  });

  const setName = (value: string) => {
    const name = value.slice(0, 24);
    setLearner(name);
    if (name.trim()) localStorage.setItem('folio-name', name);
    else localStorage.removeItem('folio-name');
  };

  const totalSolved = Object.values(progress.mastery).reduce((a, m) => a + m.correct, 0);
  const totalMinutes = Math.round(Object.values(progress.mastery).reduce((a, m) => a + m.ms, 0) / 60_000);
  const mins = (ms: number) => ms <= 0 ? '0m' : ms < 60_000 ? '<1m' : `${Math.round(ms / 60_000)}m`;

  // --- creative/explore time: making vs listening --------------------------------

  const flushModeTime = () => {
    const now = Date.now();
    if (consumeStart.current) { pendingConsume.current += Math.min(now - consumeStart.current, 60_000); consumeStart.current = 0; }
    if (exploreStart.current) {
      const add = Math.min(now - exploreStart.current, 10 * 60_000);
      exploreStart.current = 0;
      setProgress(p => ({ ...p, explore: { ms: p.explore.ms + add } }));
    }
    if (pendingCreate.current || pendingConsume.current) {
      const c = pendingCreate.current, k = pendingConsume.current;
      pendingCreate.current = 0; pendingConsume.current = 0;
      setProgress(p => ({ ...p, creative: { createMs: p.creative.createMs + c, consumeMs: p.creative.consumeMs + k } }));
    }
  };

  const onActivity = () => {
    clearTimeout(idleTimer.current);
    if (mode !== 'create') return;
    const now = Date.now();
    strokesSinceBeat.current += 1;
    if (consumeStart.current) { pendingConsume.current += Math.min(now - consumeStart.current, 60_000); consumeStart.current = 0; }
    if (lastInkAt.current && now - lastInkAt.current < 10_000) pendingCreate.current += now - lastInkAt.current;
    lastInkAt.current = now;
  };

  // --- page turning ----------------------------------------------------------------

  const swapPage = (updated: Progress, message?: string) => {
    const nextTopic = chooseTopic(updated.mastery);
    const pooled = takeStory(nextTopic.id);
    setTopic(nextTopic);
    setProblem(pooled ?? makeProblem(nextTopic, Math.random, new Set(recentPages.current[nextTopic.id] ?? [])));
    setTries(0); setHints(0); setLastRead(null); setClearSignal(n => n + 1); setFlourish(false);
    locked.current = false;
    const review = isReviewDue(updated.mastery[nextTopic.id]);
    setNote({ tone: 'muse', text: message ?? (review ? `Let's flip back to "${nextTopic.short}" — just to keep it shiny.`
      : nextTopic.id !== topic.id ? `A new chapter: ${nextTopic.short}.` : 'The page turns…') });
  };

  const turnPage = (updated: Progress, message?: string) => {
    if (eink) {
      setFlash(true); window.setTimeout(() => setFlash(false), 260);
      return swapPage(updated, message);
    }
    setPhase('out');
    window.setTimeout(() => {
      swapPage(updated, message);
      setPhase('in');
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase('idle')));
    }, 430);
  };

  // --- practice: answers and hints ---------------------------------------------------

  const check = (value: number, alts: number[] = [], record = true) => {
    if (locked.current || phase !== 'idle') return;
    clearTimeout(idleTimer.current);
    setLastRead(value);
    const now = Date.now();
    const ms = now - pageShownAt.current;
    const nextTries = tries + 1;
    setTries(nextTries);
    if (value === problem.answer) {
      locked.current = true;
      const firstTry = nextTries === 1 && hints === 0;
      const mastery = recordAttempt(progress.mastery, topic.id, true, firstTry, { hints, ms, now });
      const updated = touchSession({ ...progress, mastery, attempts: progress.attempts + 1, streak: progress.streak + 1 }, 'solved', now);
      setProgress(updated);
      const mastered = !isMastered(progress.mastery[topic.id]) && isMastered(mastery[topic.id]);
      if (mastered) {
        setFlourish(true);
        setNote({ tone: 'good', text: `${value} — and that's "${topic.short}" all yours now. New pages unlock…` });
      } else {
        setNote({ tone: 'good', text: `${value} — ${takeQuip(problem) ?? PRAISE[updated.attempts % PRAISE.length]}` });
      }
      window.setTimeout(() => turnPage(updated), eink ? 900 : mastered ? 1900 : 1300);
    } else if (record) {
      const mastery = recordAttempt(progress.mastery, topic.id, false, false, { hints, ms, now });
      setProgress(p => touchSession({ ...p, mastery, attempts: p.attempts + 1, streak: 0 }, 'miss', now));
      setNote({ tone: 'gentle', text: `${value}? ${NUDGE[nextTries % NUDGE.length]}`, alts });
    } else {
      // an uncertain reading: answer the child, but never mark the mastery model
      setNote({ tone: 'gentle', text: `Is that a ${value}? If so — not quite yet.`, alts });
    }
  };

  const onCircleAnswer = (enclosed: Stroke[]) => {
    if (intro || mode !== 'practice' || locked.current || phase !== 'idle') return;
    const guess = recognizeNumber(enclosed);
    if (!guess) return;
    if (!isLegible(guess)) {
      // Probably a circled drawing (groups, arrays) — stay quiet unless it
      // looks like a deliberate answer: a couple of good-sized strokes. Then
      // offer the best readings as tappable chips so no one gets stuck.
      const tall = enclosed.some(s => {
        const ys = s.map(p => p.y);
        return Math.max(...ys) - Math.min(...ys) >= 24;
      });
      if (enclosed.length <= 4 && tall) {
        const candidates = [guess.value, ...alternatives(guess)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
        setNote({ tone: 'gentle', text: "I couldn't quite read that — write it bigger, or tap the number you meant.", alts: candidates });
      }
      return;
    }
    const alts = alternatives(guess).filter(v => v !== guess.value);
    check(guess.value, alts, guess.value === problem.answer || isConfident(guess));
  };

  // The escalation seam: deterministic whisper → local little brain → wiser cloud friend.
  const hint = async () => {
    if (locked.current || phase !== 'idle') return;
    clearTimeout(idleTimer.current);
    const n = hints + 1;
    setHints(n);
    setProgress(p => touchSession(p, 'hint'));
    const deterministic = n === 1 ? problem.hint1 : problem.hint2;
    if (activeBrain(cloud) && (n >= 2 || tries >= 2)) {
      setNote({ tone: 'thinking', text: 'One moment — I know a wiser friend…' });
      try {
        // Show the tutor the page itself: their working, drawings, crossings-out.
        const ink = pad.current?.snapshot() ?? undefined;
        const asked = `Problem: ${formatForTutor(problem)}. The child has tried ${tries} time(s)${lastRead != null ? `, last circling ${lastRead}` : ''}, and is asking for hint number ${n}. ` +
          (ink ? 'Attached is a photo of their actual page — look at what they really wrote or drew (their marks, groups, crossings-out) and ground your nudge in it. ' : '') +
          'Give one gentle nudge.';
        const text = await askCloud(cloud, withIdentity(CLOUD_SYSTEM_PROMPT, learner), asked, ink);
        if (text) return setNote({ tone: 'muse', text });
      } catch { /* fall through to the local brain */ }
    }
    if (modelStatus === 'ready') {
      setNote({ tone: 'thinking', text: 'Let me think…' });
      try {
        const text = await getLocalHint(formatForTutor(problem), lastRead != null ? String(lastRead) : '', learner);
        if (text) {
          logEvent(`voice: local hint served (${text.length} chars)`);
          return setNote({ tone: 'muse', text });
        }
        logEvent('voice: local hint came back empty');
      } catch (error) {
        logEvent(`voice: local hint failed — ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    setNote({ tone: 'muse', text: deterministic });
  };

  // --- create mode: co-writing -------------------------------------------------------

  const startStory = () => {
    setStory([fallbackOpening(interests, learner)]);
    strokesSinceBeat.current = 0;
    lastInkAt.current = 0;
    consumeStart.current = Date.now();
    setClearSignal(n => n + 1);
    setArt(null);
    setNote({ tone: 'muse', text: 'Draw and write what happens next — then draw a ? and I\'ll add my part.' });
  };

  const createBeat = async () => {
    if (storyBusy) return;
    // Turn-taking and healthy balance: the notebook never takes two turns in a
    // row, and when listening outweighs making, it asks for more ink first.
    const consumed = progress.creative.consumeMs + pendingConsume.current;
    const created = progress.creative.createMs + pendingCreate.current;
    const needed = consumed > 2 * created + 60_000 ? 8 : 3;
    if (strokesSinceBeat.current < needed) {
      setNote({ tone: 'gentle', text: `Your turn first${learner ? ', ' + learner : ''} — draw or write what happens next, then ask me again.` });
      return;
    }
    setStoryBusy(true);
    setNote({ tone: 'thinking', text: 'Hmm, what happens next…' });
    try {
      let beat: string | null = null;
      if (activeBrain(cloud)) {
        try {
          const ink = pad.current?.snapshot() ?? undefined;
          const asked = `Our story so far:\n${story.slice(-4).join('\n')}\n` +
            (ink ? "Attached is the child's page — weave what they actually drew or wrote into the next beat. " : '') +
            'Add the next beat.';
          beat = acceptContribution(await askCloud(cloud, withIdentity(CREATE_SYSTEM, learner), asked, ink));
        } catch { /* fall through to the local brain */ }
      }
      beat ??= await localContribution(story, interests, learner);
      setStory(s => [...s, beat!]);
      strokesSinceBeat.current = 0;
      flushModeTime();
      consumeStart.current = Date.now();
      setNote({ tone: 'muse', text: 'Your turn — what happens next?' });
    } finally { setStoryBusy(false); }
  };

  // --- explore mode: wonders -----------------------------------------------------------

  const offerTopics = async () => {
    if (exploreBusy) return;
    setExploreBusy(true);
    setExplorePassage(null);
    setArt(null);
    setNote({ tone: 'thinking', text: 'Gathering wonders…' });
    try {
      setExploreTopics(await localTopics(interests, learner));
      setNote({ tone: 'muse', text: 'Tap one — or draw a ? for different wonders.' });
    } finally { setExploreBusy(false); }
  };

  const openTopic = async (chosen: string) => {
    if (exploreBusy) return;
    setExploreBusy(true);
    setNote({ tone: 'thinking', text: 'Let me tell you something true…' });
    try {
      let passage: string | null = null;
      if (activeBrain(cloud)) {
        try { passage = acceptPassage(await askCloud(cloud, withIdentity(PASSAGE_SYSTEM, learner), `The topic: ${chosen}. Tell one wondrous true thing.`)); }
        catch { /* fall through to the local brain */ }
      }
      passage ??= await localPassage(chosen, learner);
      passage ??= isAwake()
        ? 'My little brain stumbled on that one — tap it again, or pick another wonder.'
        : "That's a wonderful thing to wonder about — wake my little brain, or lend me a key, and I'll tell you true things about it.";
      setExplorePassage(passage);
      setNote({ tone: 'muse', text: 'Draw what you imagine — or draw a ? for new wonders.' });
      if (cloud.illustrations && imageProvider(cloud)) {
        generateIllustration(cloud, `A child's crayon drawing of ${chosen}, warm and simple, plain cream paper background, no words or letters.`)
          .then(url => { if (url) setArt(url); })
          .catch(() => { /* the page simply stays unillustrated */ });
      }
    } finally { setExploreBusy(false); }
  };

  // --- modes and intro --------------------------------------------------------------------

  const switchMode = (next: Mode) => {
    setModeMenu(false);
    if (next === mode) return;
    flushModeTime();
    setMode(next);
    setClearSignal(n => n + 1);
    setArt(null);
    setExplorePassage(null);
    if (next === 'create') startStory();
    if (next === 'explore') { exploreStart.current = Date.now(); void offerTopics(); }
    if (next === 'practice') setNote({ tone: 'muse', text: 'Back to our pages — this one is yours.' });
  };

  const onQuestionMark = () => {
    if (intro) return;
    if (mode === 'create') return void createBeat();
    if (mode === 'explore') return void offerTopics();
    return void hint();
  };

  const submitInk = () => {
    if (pad.current?.submit()) return;
    setNote({ tone: 'muse', text: 'Write an answer on the page first — then hand it in.' });
  };

  const beginNotebook = (name: string) => {
    setIntro(null);
    setNote({ tone: 'welcome', text: name ? `Lovely to meet you, ${name}. ${WELCOME_BODY}` : WELCOME });
  };

  const submitName = (value: string) => {
    setName(value.trim());
    const name = value.trim().slice(0, 24);
    if (brainOn || modelStatus !== 'off') beginNotebook(name);
    else setIntro('brain');
  };

  const resetNotebook = () => {
    if (!resetArmed) {
      setResetArmed(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setResetArmed(false), 6000);
      return;
    }
    clearTimeout(resetTimer.current);
    setResetArmed(false);
    localStorage.removeItem('folio-progress');
    localStorage.removeItem('folio-name');
    const fresh = freshProgress();
    setProgress(fresh);
    setPanel('none');
    setLearner('');
    setNameDraft('');
    setMode('practice');
    locked.current = false;
    pendingCreate.current = 0; pendingConsume.current = 0; consumeStart.current = 0; exploreStart.current = 0;
    turnPage(fresh, ' ');
    setIntro('name');
  };

  const toggleBrain = (on: boolean) => {
    setBrainOn(on);
    if (on) {
      localStorage.setItem('folio-brain', 'on');
      if (modelStatus === 'off' || modelStatus === 'error') void enableModel();
    } else {
      localStorage.removeItem('folio-brain');
      const wasRunning = modelStatus === 'ready' || modelStatus === 'loading';
      setModelStatus('off');
      setModelMessage('');
      if (wasRunning) void sleepTutor().catch(() => {});
    }
  };

  const keyField = (id: ProviderId, placeholder: string) => <>
    <input type="password" autoComplete="off" placeholder="paste an API key" aria-label={`${id} API key`}
      value={cloud.keys[id] ?? ''} onChange={e => updateCloud(c => { c.keys[id] = e.target.value; })} />
    <input type="text" autoComplete="off" placeholder={placeholder} aria-label={`${id} model`}
      value={cloud.models[id] ?? ''} onChange={e => updateCloud(c => { c.models[id] = e.target.value; })} />
  </>;

  const streak = progress.mastery[topic.id]?.streak ?? 0;
  const topicMastered = isMastered(progress.mastery[topic.id]);

  return <main className="diary">
    {flash && <div className="eink-flash" aria-hidden />}

    <div className={`leaf ${phase !== 'idle' ? phase : ''}`}>
      <InkPad ref={pad} clearSignal={clearSignal} eink={eink} onCircleAnswer={onCircleAnswer} onQuestionMark={onQuestionMark}
        onActivity={onActivity} />
      <div className="overlay">
        {intro === 'name' && <div className="intro">
          <p className="story"><Handwrite text="Hello. I'm Folio — a notebook that writes back. Whose notebook am I?" /></p>
          <div className="intro-row">
            <input className="name-line" autoComplete="off" maxLength={24} placeholder="write your name"
              value={nameDraft} onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && nameDraft.trim()) submitName(nameDraft); }} />
            <button className="inkbutton" disabled={!nameDraft.trim()} onClick={() => submitName(nameDraft)}>That's me</button>
          </div>
          <button className="text-button intro-skip" onClick={() => submitName('')}>I'd rather stay mysterious</button>
        </div>}
        {intro === 'brain' && <div className="intro">
          <p className="story"><Handwrite text={`${learner ? learner + ' — o' : 'O'}ne more thing. I have a little brain of my own: it retells problems around things you love and cheers in its own words. It needs a one-time download, and it thinks only on this device — nothing you write ever leaves. Shall I wake it?`} /></p>
          <div className="intro-row">
            <button className="inkbutton" onClick={() => { toggleBrain(true); beginNotebook(learner); }}>Wake the little brain</button>
            <button className="text-button" onClick={() => beginNotebook(learner)}>Maybe later</button>
          </div>
        </div>}

        {!intro && mode === 'practice' && <div className={`problem ${art ? 'with-art' : ''}`} aria-live="polite">
          {problem.kind === 'story'
            ? <p className="story"><Handwrite key={problem.statement} text={problem.statement} /></p>
            : <>
                <p className="equation"><Handwrite key={problem.equation} text={problem.equation!} /></p>
                <p className="whisper"><Handwrite key={problem.statement} text={problem.statement} /></p>
              </>}
        </div>}
        {!intro && mode === 'create' && <div className="problem storylines" aria-live="polite">
          {story.slice(-3).map((beat, i) => <p className="story storybeat" key={`${story.length - 3 + i}-${beat.slice(0, 12)}`}><Handwrite key={beat} text={beat} /></p>)}
        </div>}
        {!intro && mode === 'explore' && <div className={`problem ${art ? 'with-art' : ''}`} aria-live="polite">
          {explorePassage
            ? <p className="story"><Handwrite key={explorePassage} text={explorePassage} /></p>
            : <div className="topics">{exploreTopics.map(t =>
                <button key={t} className="topicchip" onClick={() => void openTopic(t)}>{t}</button>)}</div>}
        </div>}

        {art && <img className="polaroid" src={art} alt="" />}
        {flourish && <svg className="flourish" viewBox="0 0 100 100" aria-hidden>
          <path pathLength="100" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
            d="M50 8 L61 38 L93 39 L67 58 L77 90 L50 71 L23 90 L33 58 L7 39 L39 38 Z" />
        </svg>}
        {!intro && <div className={`note ${note.tone}`} aria-live="polite">
          {note.tone === 'thinking' && <span className="quill" aria-hidden>✎</span>}
          <Handwrite key={note.text} text={note.text} />
          {!!note.alts?.length && <span className="alts"> or was it {note.alts.map(v =>
            <button key={v} className="alt" onClick={() => check(v)}>{v}</button>)}?</span>}
        </div>}
      </div>
    </div>

    {!intro && <div className="mode-corner">
      <button className="mode-script" onClick={() => setModeMenu(m => !m)} aria-expanded={modeMenu}>{MODE_LABEL[mode]} ▾</button>
      {modeMenu && <div className="mode-menu">
        {(['practice', 'create', 'explore'] as const).map(m =>
          <button key={m} className={m === mode ? 'current' : ''} onClick={() => switchMode(m)}>{MODE_LABEL[m]}</button>)}
      </div>}
    </div>}

    <button className="chapter-script" onClick={() => setPanel(panel === 'contents' ? 'none' : 'contents')} aria-expanded={panel === 'contents'}>
      — {mode === 'practice' ? topic.short : MODE_LABEL[mode]} —
      {mode === 'practice' && <span className="chapter-dots" aria-label={topicMastered ? 'chapter mastered' : `${Math.min(streak, MASTERY_STREAK)} of ${MASTERY_STREAK} toward mastery`}>
        {topicMastered ? '★' : Array.from({ length: MASTERY_STREAK }, (_, i) =>
          <i key={i} className={i < streak ? 'filled' : ''} aria-hidden />)}
      </span>}
    </button>
    <button className="ribbon" aria-label="Notebook settings" onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')} aria-expanded={panel === 'settings'} />
    <button className="dogear" aria-label="Turn to a fresh page" onClick={() => {
      if (intro) return;
      if (mode === 'create') return startStory();
      if (mode === 'explore') return void offerTopics();
      if (!locked.current && phase === 'idle') turnPage(progress, 'A fresh page, then.');
    }} />
    <span className="pageno" aria-hidden>· {progress.attempts + 1} ·</span>
    <p className="legend" aria-hidden>{LEGEND[mode]}</p>
    {!intro && <nav className="tool-shelf" aria-label="Notebook tools">
      <button type="button" onClick={() => pad.current?.undo()} aria-label="Undo last stroke">↶ <span>undo</span></button>
      <button type="button" onClick={onQuestionMark} disabled={phase !== 'idle' || storyBusy || exploreBusy}
        aria-label={mode === 'practice' ? 'Ask for a hint' : mode === 'create' ? "Add Folio's turn" : 'Find new wonders'}>
        ? <span>{mode === 'practice' ? 'hint' : mode === 'create' ? 'my turn' : 'new wonders'}</span>
      </button>
      {mode === 'practice' && <button type="button" onClick={submitInk} disabled={phase !== 'idle'} aria-label="Hand in written answer">✓ <span>hand in</span></button>}
    </nav>}

    {panel === 'contents' && <aside className="panel">
      <div className="panel-title"><h2>In this notebook</h2><button className="close" aria-label="Close" onClick={() => setPanel('none')}>×</button></div>
      <p className="panel-note">{totalSolved} answers found across {daysWritten(progress)} {daysWritten(progress) === 1 ? 'day' : 'days'} · {progress.streak} in a row right now. Chapters open when the ideas they lean on are yours, and faded ones come back for a polish.</p>
      <ul className="map">
        {TOPICS.map(t => {
          const m = progress.mastery[t.id];
          const state = isMastered(m) ? 'mastered' : isUnlocked(t.id, progress.mastery) ? (t.id === topic.id ? 'current' : 'open') : 'locked';
          return <li key={t.id} className={state}>
            <i>{state === 'mastered' ? '★' : state === 'locked' ? '○' : '◐'}</i>
            <div>
              <strong>{t.short}{state === 'current' ? ' — we are here' : ''}{isReviewDue(m) ? ' · time for a polish' : ''}{isStruggling(m) ? ' · tricky right now' : ''}</strong>
              <small>{t.name} · ages {t.ageRangeStart}–{t.ageRangeEnd}{m ? ` · ${m.correct}/${m.attempts}` : ''}</small>
            </div>
          </li>;
        })}
      </ul>
      <small className="attribution">Curriculum structure: Marble Skill Taxonomy (v1) · © Generative Spark, Inc. · withmarble.com · ODbL 1.0 / CC BY-SA 4.0</small>
    </aside>}

    {panel === 'settings' && <aside className="panel">
      <div className="panel-title"><h2>The notebook's secrets</h2><button className="close" aria-label="Close" onClick={() => setPanel('none')}>×</button></div>

      <label className="toggle"><span>This notebook belongs to<small>The notebook weaves the name into its own words</small></span>
        <input type="text" className="interests" maxLength={24} placeholder="a mysterious child" value={learner}
          onChange={e => setName(e.target.value)} /></label>

      <label className="toggle"><span>E-ink discipline<small>Limited palette, still transitions, page-turn refresh</small></span>
        <input type="checkbox" checked={eink} onChange={e => setEink(e.target.checked)} /></label>

      <section>
        <h3>The notebook's own little brain</h3>
        <p>Optional and private: downloads {MODEL_ID} once and thinks on this device with WebGPU. Once awake it retells story problems around this learner's favorite things, co-writes story pages, offers wonders to explore, cheers in its own words, and whispers hints — nothing written here ever leaves.</p>
        <label className="toggle"><span>Keep the little brain awake<small>Wakes with the notebook from now on</small></span>
          <input type="checkbox" checked={brainOn} onChange={e => toggleBrain(e.target.checked)} /></label>
        <label className="toggle"><span>Stories about…<small>Favorite things, comma-separated — the brain weaves them in</small></span>
          <input type="text" className="interests" placeholder="dinosaurs, rockets" value={interests}
            onChange={e => { setInterests(e.target.value); localStorage.setItem('folio-interests', e.target.value); }} /></label>
        {modelStatus === 'loading' && <small>{modelMessage || 'Waking up…'}</small>}
        {modelStatus === 'ready' && <small>{modelMessage}</small>}
        {modelStatus === 'error' && <small className="error">{modelMessage}</small>}
      </section>

      <section>
        <h3>Wiser friends <em>(bring your own key)</em></h3>
        <p>With a key, the notebook may quietly consult a big model when someone is truly stuck — hints only, never answers. On story and wonder pages it also helps co-write and explain. Keys live in this notebook on this device and are sent only to the company named beside them.</p>
        {CHAT_PROVIDERS.map(p => <div className="provider" key={p.id}>
          <span className="provider-name">{p.label}<small>{p.keyHint}</small></span>
          {keyField(p.id, p.defaultModel)}
        </div>)}
        <label className="toggle"><span>Ask first</span>
          <select value={cloud.brain} onChange={e => updateCloud(c => { c.brain = e.target.value as CloudSettings['brain']; })}>
            <option value="auto">whoever has a key</option>
            {CHAT_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select></label>
      </section>

      <section>
        <h3>Little pictures</h3>
        <p>Story and wonder pages can get a small drawing, taped in by the notebook. A GPT key draws with gpt-image; otherwise a fal.ai key is used.</p>
        <div className="provider">
          <span className="provider-name">fal.ai<small>fal.ai/dashboard/keys</small></span>
          {keyField('fal', FAL_DEFAULT_MODEL)}
        </div>
        <label className="toggle"><span>Draw on story pages</span>
          <input type="checkbox" checked={cloud.illustrations} onChange={e => updateCloud(c => { c.illustrations = e.target.checked; })} /></label>
      </section>

      <section>
        <h3>For grown-ups</h3>
        <p>{totalSolved} solved · about {totalMinutes} focused {totalMinutes === 1 ? 'minute' : 'minutes'} · {daysWritten(progress)} {daysWritten(progress) === 1 ? 'day' : 'days'} written. Chapters marked tricky are getting easier warm-ups automatically.</p>
        {(progress.creative.createMs + progress.creative.consumeMs > 0 || progress.explore.ms > 0) &&
          <p>Story pages: {mins(progress.creative.createMs)} making · {mins(progress.creative.consumeMs)} listening
            {progress.explore.ms > 0 ? <> · wonder pages: {mins(progress.explore.ms)}</> : null}. The notebook keeps making ahead of listening by asking for the child's part first.</p>}
        {Object.keys(progress.mastery).length > 0 && <table className="grownups">
          <thead><tr><th>chapter</th><th>right</th><th>min</th><th>hints</th><th></th></tr></thead>
          <tbody>
            {TOPICS.filter(t => progress.mastery[t.id]?.attempts).map(t => {
              const m = progress.mastery[t.id];
              return <tr key={t.id}>
                <td>{t.short}</td>
                <td>{m.correct}/{m.attempts}</td>
                <td>{Math.max(1, Math.round(m.ms / 60_000))}</td>
                <td>{m.hints}</td>
                <td>{isMastered(m) ? '★' : isStruggling(m) ? '⚑ tricky' : ''}</td>
              </tr>;
            })}
          </tbody>
        </table>}
      </section>

      <section>
        <h3>If something goes wrong</h3>
        <p>The notebook keeps a small technical journal — boots, the little brain waking, errors. No writing or answers are ever recorded in it. If a page crashed, the story of what happened is in here.</p>
        <button className="text-button" onClick={() => setJournalOpen(o => !o)}>{journalOpen ? 'Hide the journal' : `Show the journal (${readJournal().length} entries)`}</button>
        {journalOpen && <>
          <ol className="journal">
            {readJournal().slice(-14).reverse().map((e, i) =>
              <li key={i}><span>{new Date(e.t).toLocaleTimeString()}</span> {e.m}</li>)}
          </ol>
          <button className="inkbutton" onClick={async () => {
            try { await navigator.clipboard.writeText(journalReport()); setJournalCopied('copied'); }
            catch { setJournalCopied('manual'); }
          }}>Copy journal</button>
          {journalCopied === 'copied' && <small>Copied — paste it to whoever is helping you.</small>}
          {journalCopied === 'manual' && <textarea className="journal-raw" readOnly value={journalReport()} onFocus={e => e.currentTarget.select()} />}
          <button className="text-button" onClick={() => { clearJournal(); setJournalOpen(false); }}>Clear the journal</button>
        </>}
      </section>

      <section>
        <h3>Keeping the notebook</h3>
        <button className="text-button" onClick={() => downloadProgress(progress)}>Export my progress</button>
        <label className="import-button">Import progress<input type="file" accept="application/json,.json" onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return;
          try { const imported = parseProgressExport(await file.text()); setProgress(imported); turnPage(imported, 'Welcome back.'); setPanel('none'); }
          catch (error) { setImportError(error instanceof Error ? error.message : 'Could not import that file.'); }
          event.target.value = '';
        }} /></label>
        {importError && <small className="error">{importError}</small>}
        <button className={`text-button danger ${resetArmed ? 'armed' : ''}`} onClick={resetNotebook}>
          {resetArmed ? 'Tap once more to blank every page — there is no undo' : 'Reset progress & stats (start the notebook over)'}
        </button>
        <small>Erases all pages, mastery, stats, and the name. Keys and settings stay.</small>
      </section>
    </aside>}
  </main>;
}
