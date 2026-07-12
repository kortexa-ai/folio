import { useEffect, useMemo, useRef, useState } from 'react';
import { InkPad } from './InkPad';
import { chooseTopic, formatForTutor, isMastered, isUnlocked, makeProblem, recordAttempt, TOPICS, topicById, type Problem, type Topic } from './curriculum';
import { alternatives, recognizeNumber, type NumberGuess, type Stroke } from './recognizer';
import { getLocalHint, loadTutor, MODEL_ID } from './localTutor';
import { downloadProgress, loadProgress, parseProgressExport, saveProgress, type Progress } from './storage';

type Feedback = { kind: 'quiet' | 'good' | 'try'; text: string };

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [topic, setTopic] = useState<Topic>(() => chooseTopic(loadProgress().mastery));
  const [problem, setProblem] = useState<Problem>(() => makeProblem(topic));
  const [guess, setGuess] = useState<NumberGuess | null>(null);
  const [tries, setTries] = useState(0);
  const [hints, setHints] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'quiet', text: 'Work it out on the page, then write your answer in the box.' });
  const [clearSignal, setClearSignal] = useState(0);
  const [panel, setPanel] = useState<'none' | 'settings' | 'map'>('none');
  const [eink, setEink] = useState(() => localStorage.getItem('folio-eink') === 'true');
  const [flash, setFlash] = useState(false);
  const [modelStatus, setModelStatus] = useState<'off' | 'loading' | 'ready' | 'error'>('off');
  const [modelMessage, setModelMessage] = useState('');
  const locked = useRef(false);

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => {
    document.documentElement.dataset.eink = String(eink);
    localStorage.setItem('folio-eink', String(eink));
  }, [eink]);

  const totalSolved = useMemo(() => Object.values(progress.mastery).reduce((a, m) => a + m.correct, 0), [progress]);

  const turnPage = (updated: Progress, note?: string) => {
    if (eink) { setFlash(true); window.setTimeout(() => setFlash(false), 260); }
    const nextTopic = chooseTopic(updated.mastery);
    setTopic(nextTopic);
    setProblem(makeProblem(nextTopic));
    setGuess(null); setTries(0); setHints(0); setClearSignal(n => n + 1);
    locked.current = false;
    setFeedback({ kind: 'quiet', text: note ?? (nextTopic.id !== topic.id ? `New chapter: ${nextTopic.short}.` : 'Here comes the next one.') });
  };

  const onAnswerStrokes = (strokes: Stroke[]) => {
    if (locked.current) return;
    if (!strokes.length) return setGuess(null);
    const g = recognizeNumber(strokes);
    setGuess(g);
    if (!g) setFeedback({ kind: 'quiet', text: "I couldn't read that — try writing the digits a little bigger." });
  };

  const check = (value?: number) => {
    if (locked.current) return;
    const answer = value ?? guess?.value;
    if (answer == null) return setFeedback({ kind: 'try', text: 'Write your answer in the dashed box first — your best guess is welcome.' });
    const nextTries = tries + 1;
    setTries(nextTries);
    if (answer === problem.answer) {
      locked.current = true;
      const firstTry = nextTries === 1 && hints === 0;
      const mastery = recordAttempt(progress.mastery, topic.id, true, firstTry);
      const updated: Progress = { ...progress, mastery, attempts: progress.attempts + 1, streak: progress.streak + 1 };
      setProgress(updated);
      const mastered = !isMastered(progress.mastery[topic.id]) && isMastered(mastery[topic.id]);
      setFeedback({ kind: 'good', text: mastered ? `That's "${topic.short}" mastered. New pages unlock.` : firstTry ? 'Exactly right.' : 'You found it. Nice recovery.' });
      window.setTimeout(() => turnPage(updated), eink ? 900 : 1200);
    } else {
      const mastery = recordAttempt(progress.mastery, topic.id, false, false);
      setProgress(p => ({ ...p, mastery, attempts: p.attempts + 1, streak: 0 }));
      setFeedback({ kind: 'try', text: `I read ${answer} — not quite yet. Check your work and write again.` });
    }
  };

  const hint = async () => {
    const n = hints + 1;
    setHints(n);
    const deterministic = n === 1 ? problem.hint1 : problem.hint2;
    if (modelStatus === 'ready') {
      setFeedback({ kind: 'quiet', text: 'Thinking on this device…' });
      try {
        const text = await getLocalHint(formatForTutor(problem), guess ? String(guess.value) : '');
        return setFeedback({ kind: 'quiet', text: text || deterministic });
      } catch { /* fall through */ }
    }
    setFeedback({ kind: 'quiet', text: deterministic });
  };

  const enableModel = async () => {
    setModelStatus('loading');
    try { await loadTutor(setModelMessage); setModelStatus('ready'); setModelMessage('Local tutor ready'); }
    catch (error) { setModelStatus('error'); setModelMessage(error instanceof Error ? error.message : 'Could not load local tutor.'); }
  };

  const alts = guess ? alternatives(guess).filter(v => v !== guess.value) : [];

  return <main className="app-shell">
    {flash && <div className="eink-flash" aria-hidden />}
    <header>
      <button className="brand" onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')} aria-expanded={panel === 'settings'}><span>F</span> folio</button>
      <button className="chapter" onClick={() => setPanel(panel === 'map' ? 'none' : 'map')} aria-expanded={panel === 'map'}>
        <small>CHAPTER</small><strong>{topic.short}</strong><small className="chapter-open">view the map</small>
      </button>
      <div className="progress" aria-label={`${totalSolved} problems solved`}><span>{totalSolved}</span><small>SOLVED</small></div>
    </header>

    {panel === 'map' && <aside className="panel">
      <div className="panel-title"><strong>Learning map</strong><button className="close" onClick={() => setPanel('none')}>×</button></div>
      <p className="panel-note">Every chapter unlocks when the ideas it depends on are mastered — the order comes from a real curriculum graph, not a fixed list.</p>
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
      <div className="panel-title"><strong>Notebook settings</strong><button className="close" onClick={() => setPanel('none')}>×</button></div>
      <label><span>E-ink discipline<small>Limited palette, still transitions, page-turn refresh</small></span><input type="checkbox" checked={eink} onChange={e => setEink(e.target.checked)} /></label>
      <section><strong>Private local tutor</strong><p>Optional. Downloads {MODEL_ID} once and runs it with WebGPU. Your answers never leave this device.</p>
        <button className="secondary" disabled={modelStatus === 'loading' || modelStatus === 'ready'} onClick={enableModel}>{modelStatus === 'ready' ? 'Tutor ready' : modelStatus === 'loading' ? 'Preparing…' : 'Enable local AI'}</button>
        {modelMessage && <small className={modelStatus === 'error' ? 'error' : ''}>{modelMessage}</small>}
      </section>
      <button className="text-button" onClick={() => downloadProgress(progress)}>Export my progress</button>
      <label className="import-button">Import progress<input type="file" accept="application/json,.json" onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return;
        try { const imported = parseProgressExport(await file.text()); setProgress(imported); turnPage(imported, 'Welcome back.'); setPanel('none'); }
        catch (error) { alert(error instanceof Error ? error.message : 'Could not import that file.'); }
        event.target.value = '';
      }} /></label>
      <button className="text-button danger" onClick={() => { if (confirm('Erase all Folio progress?')) { localStorage.clear(); location.reload(); } }}>Start over</button>
    </aside>}

    <section className="lesson">
      <div className="lesson-intro">
        <p>{problem.kind === 'story' ? 'Read the story, work it out below.' : problem.kind === 'missing' ? 'Find the number hiding in the box.' : 'Find the missing number.'}</p>
        <span>{topic.description}</span>
      </div>

      {problem.kind === 'story'
        ? <div className="story">{problem.statement}</div>
        : <div className="problem-row"><div className="equation">{problem.equation}</div></div>}

      <InkPad clearSignal={clearSignal} eink={eink} onAnswerStrokes={onAnswerStrokes} />

      <div className="read-row" aria-live="polite">
        {guess
          ? <>
              <span className="read-label">I read:</span><strong className="read-value">{guess.value}</strong>
              {alts.length > 0 && <span className="read-alts">or did you mean {alts.map(v => <button key={v} className="chip" onClick={() => { setGuess(g => g && { ...g, value: v }); }}>{v}</button>)}?</span>}
            </>
          : <span className="read-label quiet">Write your answer in the dashed box — no keyboard here.</span>}
      </div>

      <div className={`feedback ${feedback.kind}`} aria-live="polite"><span>{feedback.kind === 'good' ? '✓' : feedback.kind === 'try' ? '↺' : '✦'}</span><p>{feedback.text}</p></div>
      <div className="actions">
        <button className="secondary" onClick={hint}>Give me a hint</button>
        <button className="secondary" onClick={() => { setGuess(null); setClearSignal(n => n + 1); }}>Clear the page</button>
        <button className="primary" onClick={() => check()} disabled={!guess}>Check my answer <span>→</span></button>
      </div>
    </section>
    <footer><span>Progress stays on this device</span><i>•</i><span>{progress.streak} answer streak</span><i>•</i><span>{topicById.get(problem.topicId)?.standards[0]}</span></footer>
  </main>;
}
