import { useEffect, useRef, useState } from 'react';
import { InkPad, type InkPadHandle } from './InkPad';
import { chooseTopic, formatForTutor, isMastered, isReviewDue, isStruggling, isUnlocked, makeProblem, MASTERY_STREAK, recordAttempt, TOPICS, type Problem, type Topic } from './curriculum';
import { alternatives, isConfident, isLegible, recognizeNumber, type Stroke } from './recognizer';
import { getLocalHint, loadTutor, MODEL_ID, sleepTutor } from './localTutor';
import { prefetchQuip, prefetchStory, takeQuip, takeStory } from './voice';
import { activeBrain, askCloud, CHAT_PROVIDERS, FAL_DEFAULT_MODEL, generateIllustration, imageProvider, loadCloudSettings, saveCloudSettings, type CloudSettings, type ProviderId } from './cloud';
import { CLOUD_SYSTEM_PROMPT } from './tutorPrompt';
import { daysWritten, downloadProgress, loadProgress, parseProgressExport, saveProgress, touchSession, type Progress } from './storage';

type Note = { tone: 'welcome' | 'muse' | 'good' | 'gentle' | 'thinking'; text: string; alts?: number[] };

const WELCOME = "Hello — I'm Folio, your notebook. Write anywhere on me: work things out, scribble, cross out. When you're sure of an answer, draw a circle around it. Stuck? Draw a little ? and I'll whisper a hint.";
const PRAISE = ['Yes — exactly right.', "That's the one. Lovely.", 'Beautifully done.', 'Quite right, quite right.', 'You found it.', 'My favorite kind of page.'];
const NUDGE = ['Hmm, not quite yet. Look at it once more.', "Not this one — but you're close. Try again.", 'Almost. Check your counting, slowly.'];
const IDLE_NUDGE: Record<Problem['kind'], string> = {
  story: 'You can draw the story right on me — dots and sticks count.',
  equation: 'Try counting out loud, or draw some dots to help.',
  missing: 'What number makes both sides match? Try one in pencil.',
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
  const locked = useRef(false);
  const pageShownAt = useRef(Date.now());
  const idleTimer = useRef(0);
  const pad = useRef<InkPadHandle>(null);

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

  // The little brain wakes with the notebook once it has been invited.
  useEffect(() => { if (brainOn && modelStatus === 'off') void enableModel(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [brainOn]);

  // Each new page: start the clock, arm the idle whisper, and let the brain
  // prepare tomorrow's words (a retold story for the likely next page, and a
  // cheer for this one) while the learner thinks.
  useEffect(() => {
    pageShownAt.current = Date.now();
    if (modelStatus === 'ready') {
      prefetchQuip(problem);
      prefetchStory(chooseTopic(progress.mastery), interests);
    }
    clearTimeout(idleTimer.current);
    const delay = Number(localStorage.getItem('folio-idle-ms')) || 40_000;
    idleTimer.current = window.setTimeout(() => {
      if (!locked.current) setNote(n => (n.tone === 'good' || n.tone === 'thinking') ? n : { tone: 'muse', text: IDLE_NUDGE[problem.kind] });
    }, delay);
    return () => clearTimeout(idleTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem, modelStatus]);

  // A little taped-in drawing for story pages, when a picture key is configured.
  useEffect(() => {
    setArt(null);
    if (problem.kind !== 'story' || !cloud.illustrations || !imageProvider(cloud)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const url = await generateIllustration(cloud, illustrationPrompt(problem));
        if (!cancelled && url) setArt(url);
      } catch { /* the page simply stays unillustrated */ }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem]);

  const updateCloud = (mutate: (next: CloudSettings) => void) => setCloud(current => {
    const next: CloudSettings = { ...current, keys: { ...current.keys }, models: { ...current.models } };
    mutate(next);
    saveCloudSettings(next);
    return next;
  });

  const totalSolved = Object.values(progress.mastery).reduce((a, m) => a + m.correct, 0);
  const totalMinutes = Math.round(Object.values(progress.mastery).reduce((a, m) => a + m.ms, 0) / 60_000);

  const swapPage = (updated: Progress, message?: string) => {
    const nextTopic = chooseTopic(updated.mastery);
    const pooled = takeStory(nextTopic.id);
    setTopic(nextTopic);
    setProblem(pooled ?? makeProblem(nextTopic));
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
      setNote({ tone: 'gentle', text: `Is that a ${value}? If so — not quite yet. Write it big and clear if I misread you.`, alts });
    }
  };

  const onCircleAnswer = (enclosed: Stroke[]) => {
    if (locked.current || phase !== 'idle') return;
    const guess = recognizeNumber(enclosed);
    if (!guess) return;
    if (!isLegible(guess)) {
      // Probably a circled drawing (groups, arrays) — stay quiet unless it
      // looks like a deliberate answer: a couple of good-sized strokes.
      const tall = enclosed.some(s => {
        const ys = s.map(p => p.y);
        return Math.max(...ys) - Math.min(...ys) >= 24;
      });
      if (enclosed.length <= 4 && tall) setNote({ tone: 'gentle', text: "I couldn't quite read that — write the number a little bigger, then circle it." });
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
        const text = await askCloud(cloud, CLOUD_SYSTEM_PROMPT, asked, ink);
        if (text) return setNote({ tone: 'muse', text });
      } catch { /* fall through to the local brain */ }
    }
    if (modelStatus === 'ready') {
      setNote({ tone: 'thinking', text: 'Let me think…' });
      try {
        const text = await getLocalHint(formatForTutor(problem), lastRead != null ? String(lastRead) : '');
        if (text) return setNote({ tone: 'muse', text });
      } catch { /* fall through to the deterministic whisper */ }
    }
    setNote({ tone: 'muse', text: deterministic });
  };

  const toggleBrain = (on: boolean) => {
    setBrainOn(on);
    if (on) {
      localStorage.setItem('folio-brain', 'on');
      if (modelStatus === 'off' || modelStatus === 'error') void enableModel();
    } else {
      localStorage.removeItem('folio-brain');
      setModelStatus('off');
      setModelMessage('');
      void sleepTutor().catch(() => {});
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
      <InkPad ref={pad} clearSignal={clearSignal} eink={eink} onCircleAnswer={onCircleAnswer} onQuestionMark={hint}
        onActivity={() => clearTimeout(idleTimer.current)} />
      <div className="overlay">
        <div className={`problem ${art ? 'with-art' : ''}`} aria-live="polite">
          {problem.kind === 'story'
            ? <p className="story"><Handwrite key={problem.statement} text={problem.statement} /></p>
            : <>
                <p className="equation"><Handwrite key={problem.equation} text={problem.equation!} /></p>
                <p className="whisper"><Handwrite key={problem.statement} text={problem.statement} /></p>
              </>}
        </div>
        {art && <img className="polaroid" src={art} alt="" />}
        {flourish && <svg className="flourish" viewBox="0 0 100 100" aria-hidden>
          <path pathLength="100" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
            d="M50 8 L61 38 L93 39 L67 58 L77 90 L50 71 L23 90 L33 58 L7 39 L39 38 Z" />
        </svg>}
        <div className={`note ${note.tone}`} aria-live="polite">
          {note.tone === 'thinking' && <span className="quill" aria-hidden>✎</span>}
          <Handwrite key={note.text} text={note.text} />
          {!!note.alts?.length && <span className="alts"> or was it {note.alts.map(v =>
            <button key={v} className="alt" onClick={() => check(v)}>{v}</button>)}?</span>}
        </div>
      </div>
    </div>

    <button className="chapter-script" onClick={() => setPanel(panel === 'contents' ? 'none' : 'contents')} aria-expanded={panel === 'contents'}>
      — {topic.short} —
      <span className="chapter-dots" aria-label={topicMastered ? 'chapter mastered' : `${Math.min(streak, MASTERY_STREAK)} of ${MASTERY_STREAK} toward mastery`}>
        {topicMastered ? '★' : Array.from({ length: MASTERY_STREAK }, (_, i) =>
          <i key={i} className={i < streak ? 'filled' : ''} aria-hidden />)}
      </span>
    </button>
    <button className="ribbon" aria-label="Notebook settings" onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')} aria-expanded={panel === 'settings'} />
    <button className="dogear" aria-label="Turn to a fresh page" onClick={() => { if (!locked.current && phase === 'idle') turnPage(progress, 'A fresh page, then.'); }} />
    <span className="pageno" aria-hidden>· {progress.attempts + 1} ·</span>
    <p className="legend" aria-hidden>circle your answer &nbsp;·&nbsp; draw ? for a hint &nbsp;·&nbsp; scribble to erase</p>

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

      <label className="toggle"><span>E-ink discipline<small>Limited palette, still transitions, page-turn refresh</small></span>
        <input type="checkbox" checked={eink} onChange={e => setEink(e.target.checked)} /></label>

      <section>
        <h3>The notebook's own little brain</h3>
        <p>Optional and private: downloads {MODEL_ID} once and thinks on this device with WebGPU. Once awake it retells story problems around this learner's favorite things, cheers in its own words, and whispers hints — nothing written here ever leaves.</p>
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
        <p>With a key, the notebook may quietly consult a big model when someone is truly stuck — hints only, never answers. Keys live in this notebook on this device and are sent only to the company named beside them.</p>
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
        <p>Story pages can get a small drawing, taped in by the notebook. A GPT key draws with gpt-image; otherwise a fal.ai key is used.</p>
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
        <h3>Keeping the notebook</h3>
        <button className="text-button" onClick={() => downloadProgress(progress)}>Export my progress</button>
        <label className="import-button">Import progress<input type="file" accept="application/json,.json" onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return;
          try { const imported = parseProgressExport(await file.text()); setProgress(imported); turnPage(imported, 'Welcome back.'); setPanel('none'); }
          catch (error) { alert(error instanceof Error ? error.message : 'Could not import that file.'); }
          event.target.value = '';
        }} /></label>
        <button className="text-button danger" onClick={() => {
          if (confirm('Blank every page of this notebook? (Your keys and settings stay.)')) { localStorage.removeItem('folio-progress'); location.reload(); }
        }}>Start the notebook over</button>
      </section>
    </aside>}
  </main>;
}
