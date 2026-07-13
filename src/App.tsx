import { useEffect, useRef, useState } from 'react';
import { InkPad } from './InkPad';
import { chooseTopic, formatForTutor, isMastered, isUnlocked, makeProblem, recordAttempt, TOPICS, type Problem, type Topic } from './curriculum';
import { alternatives, recognizeNumber, type Stroke } from './recognizer';
import { getLocalHint, loadTutor, MODEL_ID } from './localTutor';
import { activeBrain, askCloud, CHAT_PROVIDERS, FAL_DEFAULT_MODEL, generateIllustration, imageProvider, loadCloudSettings, saveCloudSettings, type CloudSettings, type ProviderId } from './cloud';
import { CLOUD_SYSTEM_PROMPT } from './tutorPrompt';
import { downloadProgress, loadProgress, parseProgressExport, saveProgress, type Progress } from './storage';

type Note = { tone: 'welcome' | 'muse' | 'good' | 'gentle' | 'thinking'; text: string; alts?: number[] };

const WELCOME = "Hello — I'm Folio, your notebook. Write anywhere on me: work things out, scribble, cross out. When you're sure of an answer, draw a circle around it. Stuck? Draw a little ? and I'll whisper a hint.";
const PRAISE = ['Yes — exactly right.', "That's the one. Lovely.", 'Beautifully done.', 'Quite right, quite right.', 'You found it.'];
const NUDGE = ['Hmm, not quite yet. Look at it once more.', "Not this one — but you're close. Try again.", 'Almost. Check your counting, slowly.'];

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
  const scene = problem.statement.replace(/[^.!]*\?\s*$/, '').trim();
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
  const [cloud, setCloud] = useState<CloudSettings>(loadCloudSettings);
  const [art, setArt] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<'off' | 'loading' | 'ready' | 'error'>('off');
  const [modelMessage, setModelMessage] = useState('');
  const locked = useRef(false);

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => {
    document.documentElement.dataset.eink = String(eink);
    localStorage.setItem('folio-eink', String(eink));
  }, [eink]);

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

  const swapPage = (updated: Progress, message?: string) => {
    const nextTopic = chooseTopic(updated.mastery);
    setTopic(nextTopic);
    setProblem(makeProblem(nextTopic));
    setTries(0); setHints(0); setLastRead(null); setClearSignal(n => n + 1);
    locked.current = false;
    setNote({ tone: 'muse', text: message ?? (nextTopic.id !== topic.id ? `A new chapter: ${nextTopic.short}.` : 'The page turns…') });
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

  const check = (value: number, alts: number[] = []) => {
    if (locked.current || phase !== 'idle') return;
    setLastRead(value);
    const nextTries = tries + 1;
    setTries(nextTries);
    if (value === problem.answer) {
      locked.current = true;
      const firstTry = nextTries === 1 && hints === 0;
      const mastery = recordAttempt(progress.mastery, topic.id, true, firstTry);
      const updated: Progress = { ...progress, mastery, attempts: progress.attempts + 1, streak: progress.streak + 1 };
      setProgress(updated);
      const mastered = !isMastered(progress.mastery[topic.id]) && isMastered(mastery[topic.id]);
      setNote({ tone: 'good', text: mastered ? `${value} — and that's "${topic.short}" all yours now. New pages unlock…` : `${value} — ${PRAISE[updated.attempts % PRAISE.length]}` });
      window.setTimeout(() => turnPage(updated), eink ? 900 : 1300);
    } else {
      const mastery = recordAttempt(progress.mastery, topic.id, false, false);
      setProgress(p => ({ ...p, mastery, attempts: p.attempts + 1, streak: 0 }));
      setNote({ tone: 'gentle', text: `${value}? ${NUDGE[nextTries % NUDGE.length]}`, alts });
    }
  };

  const onCircleAnswer = (enclosed: Stroke[]) => {
    if (locked.current || phase !== 'idle') return;
    const guess = recognizeNumber(enclosed);
    if (!guess) return setNote({ tone: 'gentle', text: "I couldn't quite read that — write the number a little bigger, then circle it." });
    check(guess.value, alternatives(guess).filter(v => v !== guess.value));
  };

  // The escalation seam: deterministic whisper → local little brain → wiser cloud friend.
  const hint = async () => {
    if (locked.current || phase !== 'idle') return;
    const n = hints + 1;
    setHints(n);
    const deterministic = n === 1 ? problem.hint1 : problem.hint2;
    if (activeBrain(cloud) && (n >= 2 || tries >= 2)) {
      setNote({ tone: 'thinking', text: 'One moment — I know a wiser friend…' });
      try {
        const asked = `Problem: ${formatForTutor(problem)}. The child has tried ${tries} time(s)${lastRead != null ? `, last circling ${lastRead}` : ''}, and is asking for hint number ${n}. Give one gentle nudge.`;
        const text = await askCloud(cloud, CLOUD_SYSTEM_PROMPT, asked);
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

  const enableModel = async () => {
    setModelStatus('loading');
    try { await loadTutor(setModelMessage); setModelStatus('ready'); setModelMessage('The little brain is awake.'); }
    catch (error) { setModelStatus('error'); setModelMessage(error instanceof Error ? error.message : 'Could not load the local tutor.'); }
  };

  const keyField = (id: ProviderId, placeholder: string) => <>
    <input type="password" autoComplete="off" placeholder="paste an API key" aria-label={`${id} API key`}
      value={cloud.keys[id] ?? ''} onChange={e => updateCloud(c => { c.keys[id] = e.target.value; })} />
    <input type="text" autoComplete="off" placeholder={placeholder} aria-label={`${id} model`}
      value={cloud.models[id] ?? ''} onChange={e => updateCloud(c => { c.models[id] = e.target.value; })} />
  </>;

  return <main className="diary">
    {flash && <div className="eink-flash" aria-hidden />}

    <div className={`leaf ${phase !== 'idle' ? phase : ''}`}>
      <InkPad clearSignal={clearSignal} eink={eink} onCircleAnswer={onCircleAnswer} onQuestionMark={hint} />
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
    </button>
    <button className="ribbon" aria-label="Notebook settings" onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')} aria-expanded={panel === 'settings'} />
    <button className="dogear" aria-label="Turn to a fresh page" onClick={() => { if (!locked.current && phase === 'idle') turnPage(progress, 'A fresh page, then.'); }} />
    <span className="pageno" aria-hidden>· {progress.attempts + 1} ·</span>
    <p className="legend" aria-hidden>circle your answer &nbsp;·&nbsp; draw ? for a hint</p>

    {panel === 'contents' && <aside className="panel">
      <div className="panel-title"><h2>In this notebook</h2><button className="close" aria-label="Close" onClick={() => setPanel('none')}>×</button></div>
      <p className="panel-note">{totalSolved} answers found · {progress.streak} in a row right now. Chapters open when the ideas they lean on are yours — the order comes from a real curriculum graph.</p>
      <ul className="map">
        {TOPICS.map(t => {
          const m = progress.mastery[t.id];
          const state = isMastered(m) ? 'mastered' : isUnlocked(t.id, progress.mastery) ? (t.id === topic.id ? 'current' : 'open') : 'locked';
          return <li key={t.id} className={state}>
            <i>{state === 'mastered' ? '●' : state === 'locked' ? '○' : '◐'}</i>
            <div><strong>{t.short}</strong><small>{t.name} · ages {t.ageRangeStart}–{t.ageRangeEnd}{m ? ` · ${m.correct}/${m.attempts}` : ''}</small></div>
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
        <p>Optional and private: downloads {MODEL_ID} once and thinks on this device with WebGPU. Nothing written here ever leaves.</p>
        <button className="inkbutton" disabled={modelStatus === 'loading' || modelStatus === 'ready'} onClick={enableModel}>
          {modelStatus === 'ready' ? 'Awake and thinking' : modelStatus === 'loading' ? 'Waking up…' : 'Wake the little brain'}</button>
        {modelMessage && <small className={modelStatus === 'error' ? 'error' : ''}>{modelMessage}</small>}
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
