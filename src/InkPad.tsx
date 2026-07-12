import { useEffect, useRef, useState } from 'react';

type Point = { x: number; y: number; pressure: number };
type Stroke = Point[];

export function InkPad({ clearSignal }: { clearSignal: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const active = useRef<Stroke | null>(null);
  const penActive = useRef(false);
  const [empty, setEmpty] = useState(true);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d332a';
    for (const stroke of strokes.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath(); ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        const p = stroke[i]; ctx.lineWidth = 2 + p.pressure * 3; ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  };

  const resize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = box.width * ratio; canvas.height = box.height * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);
    draw();
  };

  useEffect(() => { resize(); addEventListener('resize', resize); return () => removeEventListener('resize', resize); }, []);
  useEffect(() => { strokes.current = []; active.current = null; setEmpty(true); draw(); }, [clearSignal]);

  const points = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    return events.map(e => ({ x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || .35 }));
  };

  return <div className="scratchpad">
    <canvas ref={canvasRef} aria-label="Scratch space" onPointerDown={event => {
      if (event.pointerType === 'touch' && penActive.current) return;
      if (event.pointerType === 'pen') penActive.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      active.current = points(event); strokes.current.push(active.current); setEmpty(false); draw();
    }} onPointerMove={event => { if (!active.current) return; active.current.push(...points(event)); draw(); }}
      onPointerUp={event => { active.current = null; if (event.pointerType === 'pen') penActive.current = false; }}
      onPointerCancel={() => { active.current = null; penActive.current = false; }} />
    {empty && <div className="scratch-hint">Use this space to draw dots or work it out</div>}
  </div>;
}
