import { useEffect, useRef } from 'react';
import type { Stroke } from './recognizer';

type InkStroke = { points: { x: number; y: number; pressure: number }[]; inAnswer: boolean };
export type InkPadProps = {
  clearSignal: number;
  eink: boolean;
  /** Called (debounced) whenever the set of strokes in the answer zone changes. */
  onAnswerStrokes: (strokes: Stroke[]) => void;
};

const ANSWER = { w: 0.30, h: 0.42, top: 0.035, right: 0.035, maxW: 240, maxH: 170 }; // relative layout

export function InkPad({ clearSignal, eink, onAnswerStrokes }: InkPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<InkStroke[]>([]);
  const active = useRef<InkStroke | null>(null);
  const predicted = useRef<{ x: number; y: number; pressure: number }[]>([]);
  const penActive = useRef(false);
  const answerTimer = useRef<number>(0);

  const answerRect = () => {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    const w = Math.min(box.width * ANSWER.w, ANSWER.maxW);
    const h = Math.min(box.height * ANSWER.h, ANSWER.maxH);
    return { x: box.width - w - box.width * ANSWER.right, y: box.height * ANSWER.top, w, h };
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const box = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, box.width, box.height);

    // Answer zone
    const r = answerRect();
    ctx.save();
    ctx.strokeStyle = eink ? '#555' : '#b3543a';
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);
    ctx.fillStyle = eink ? '#666' : '#b3543a';
    ctx.font = 'italic 11px Charter, Georgia, serif';
    ctx.fillText('write your answer here', r.x + 10, r.y + r.h - 9);
    ctx.restore();

    // Ink
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const render = (points: InkStroke['points'], color: string) => {
      if (points.length < 2) return;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineWidth = 1.8 + points[i].pressure * 2.6;
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    };
    const ink = eink ? '#1a1a1a' : '#22403a';
    for (const s of strokes.current) render(s.points, s.inAnswer && !eink ? '#7a3a26' : ink);
    if (active.current && predicted.current.length) {
      render([...active.current.points.slice(-2), ...predicted.current], ink);
    }
  };

  const resize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = box.width * ratio;
    canvas.height = box.height * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);
    draw();
  };

  useEffect(() => { resize(); addEventListener('resize', resize); return () => removeEventListener('resize', resize); }, []);
  useEffect(() => { strokes.current = []; active.current = null; draw(); onAnswerStrokes([]); }, [clearSignal]);
  useEffect(draw, [eink]);

  const emitAnswer = () => {
    clearTimeout(answerTimer.current);
    answerTimer.current = window.setTimeout(() => {
      onAnswerStrokes(strokes.current.filter(s => s.inAnswer).map(s => s.points));
    }, 450);
  };

  const localPoints = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    return events.map(e => ({ x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.35 }));
  };

  return (
    <div className="scratchpad">
      <canvas
        ref={canvasRef}
        aria-label="Work space — write your answer in the dashed box"
        onPointerDown={event => {
          if (event.pointerType === 'touch' && penActive.current) return;
          if (event.pointerType === 'pen') penActive.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          const pts = localPoints(event);
          const r = answerRect();
          const p = pts[0];
          active.current = { points: pts, inAnswer: p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h };
          strokes.current.push(active.current);
          draw();
        }}
        onPointerMove={event => {
          if (!active.current) return;
          active.current.points.push(...localPoints(event));
          const rect = event.currentTarget.getBoundingClientRect();
          predicted.current = (event.nativeEvent.getPredictedEvents?.() ?? [])
            .map(e => ({ x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.35 }));
          draw();
        }}
        onPointerUp={event => {
          const wasAnswer = active.current?.inAnswer;
          active.current = null;
          predicted.current = [];
          if (event.pointerType === 'pen') penActive.current = false;
          draw();
          if (wasAnswer) emitAnswer();
        }}
        onPointerCancel={() => { active.current = null; predicted.current = []; penActive.current = false; draw(); }}
      />
    </div>
  );
}
