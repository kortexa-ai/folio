import { useEffect, useMemo, useState } from 'react';
import { InkPad } from './InkPad';
import { deterministicHint, formatProblem, makeProblem, nextOperation, type Problem } from './math';
import { getLocalHint, loadTutor, MODEL_ID } from './localTutor';
import { downloadProgress, loadProgress, parseProgressExport, saveProgress, type Progress } from './storage';

type Feedback = { kind: 'quiet' | 'good' | 'try'; text: string };

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const operation = nextOperation(progress.solved);
  const [problem, setProblem] = useState<Problem>(() => makeProblem(operation));
  const [answer, setAnswer] = useState('');
  const [tries, setTries] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'quiet', text: 'Take your time. Work it out below.' });
  const [clearSignal, setClearSignal] = useState(0);
  const [menu, setMenu] = useState(false);
  const [eink, setEink] = useState(() => localStorage.getItem('folio-eink') === 'true');
  const [modelStatus, setModelStatus] = useState<'off' | 'loading' | 'ready' | 'error'>('off');
  const [modelMessage, setModelMessage] = useState('');

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => { document.documentElement.dataset.eink = String(eink); localStorage.setItem('folio-eink', String(eink)); }, [eink]);

  const total = useMemo(() => Object.values(progress.solved).reduce((a, b) => a + b, 0), [progress]);
  const advance = (updated: Progress) => {
    const next = nextOperation(updated.solved);
    setProblem(makeProblem(next)); setAnswer(''); setTries(0); setClearSignal(n => n + 1);
    setFeedback({ kind: 'quiet', text: next !== operation ? `New chapter: ${next === 'subtract' ? 'taking away' : 'making groups'}!` : 'Here comes the next one.' });
  };

  const check = () => {
    if (answer.trim() === '') return setFeedback({ kind: 'try', text: 'Write an answer first—your best guess is welcome.' });
    const value = Number(answer); const nextTries = tries + 1; setTries(nextTries);
    if (value === problem.answer) {
      const updated: Progress = { ...progress, attempts: progress.attempts + 1, streak: progress.streak + 1, solved: { ...progress.solved, [problem.operation]: progress.solved[problem.operation] + 1 } };
      setProgress(updated); setFeedback({ kind: 'good', text: nextTries === 1 ? 'Exactly right.' : 'You found it. Nice recovery.' });
      window.setTimeout(() => advance(updated), eink ? 850 : 1100);
    } else {
      setProgress(p => ({ ...p, attempts: p.attempts + 1, streak: 0 }));
      setFeedback({ kind: 'try', text: 'Not quite yet. Check your drawing and try once more.' });
    }
  };

  const hint = async () => {
    setTries(t => t + 1);
    if (modelStatus === 'ready') {
      setFeedback({ kind: 'quiet', text: 'Thinking on this device…' });
      try { setFeedback({ kind: 'quiet', text: await getLocalHint(problem, answer) || deterministicHint(problem, tries) }); }
      catch { setFeedback({ kind: 'quiet', text: deterministicHint(problem, tries) }); }
    } else setFeedback({ kind: 'quiet', text: deterministicHint(problem, tries) });
  };

  const enableModel = async () => {
    setModelStatus('loading');
    try { await loadTutor(setModelMessage); setModelStatus('ready'); setModelMessage('Local tutor ready'); }
    catch (error) { setModelStatus('error'); setModelMessage(error instanceof Error ? error.message : 'Could not load local tutor.'); }
  };

  return <main className="app-shell">
    <header>
      <button className="brand" onClick={() => setMenu(!menu)} aria-expanded={menu}><span>F</span> folio</button>
      <div className="chapter"><small>CHAPTER {operation === 'add' ? '01' : operation === 'subtract' ? '02' : '03'}</small><strong>{operation === 'add' ? 'Putting together' : operation === 'subtract' ? 'Taking away' : 'Making groups'}</strong></div>
      <div className="progress" aria-label={`${total} problems solved`}><span>{total}</span><small>SOLVED</small></div>
    </header>

    {menu && <aside className="settings">
      <div><strong>Notebook settings</strong><button className="close" onClick={() => setMenu(false)}>×</button></div>
      <label><span>E-ink discipline<small>Still transitions and a limited palette</small></span><input type="checkbox" checked={eink} onChange={e => setEink(e.target.checked)} /></label>
      <section><strong>Private local tutor</strong><p>Optional. Downloads {MODEL_ID} once and runs it with WebGPU. Your answers never leave this device.</p>
        <button className="secondary" disabled={modelStatus === 'loading' || modelStatus === 'ready'} onClick={enableModel}>{modelStatus === 'ready' ? 'Tutor ready' : modelStatus === 'loading' ? 'Preparing…' : 'Enable local AI'}</button>
        {modelMessage && <small className={modelStatus === 'error' ? 'error' : ''}>{modelMessage}</small>}
      </section>
      <button className="text-button" onClick={() => downloadProgress(progress)}>Export my progress</button>
      <label className="import-button">Import progress<input type="file" accept="application/json,.json" onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return;
        try { const imported = parseProgressExport(await file.text()); setProgress(imported); advance(imported); setMenu(false); }
        catch (error) { alert(error instanceof Error ? error.message : 'Could not import that file.'); }
        event.target.value = '';
      }} /></label>
      <button className="text-button danger" onClick={() => { if (confirm('Erase all Folio progress?')) { localStorage.clear(); location.reload(); } }}>Start over</button>
    </aside>}

    <section className="lesson">
      <div className="lesson-intro"><p>Find the missing number.</p><span>Use the page however you like.</span></div>
      <div className="problem-row">
        <div className="equation">{formatProblem(problem)} <i>=</i></div>
        <input className="answer" aria-label="Your answer" inputMode="numeric" pattern="[0-9]*" value={answer} onChange={e => setAnswer(e.target.value.replace(/\D/g, '').slice(0, 2))} onKeyDown={e => e.key === 'Enter' && check()} autoFocus />
      </div>
      <InkPad clearSignal={clearSignal} />
      <div className={`feedback ${feedback.kind}`} aria-live="polite"><span>{feedback.kind === 'good' ? '✓' : feedback.kind === 'try' ? '↺' : '✦'}</span><p>{feedback.text}</p></div>
      <div className="actions"><button className="secondary" onClick={hint}>Give me a hint</button><button className="primary" onClick={check}>Check my answer <span>→</span></button></div>
    </section>
    <footer><span>Progress stays on this device</span><i>•</i><span>{progress.streak} answer streak</span></footer>
  </main>;
}
