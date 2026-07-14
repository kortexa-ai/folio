export type InkPoint = { x: number; y: number; pressure: number };

export type InkDimensions = { width: number; height: number };

/**
 * Scale page-relative ink when the notebook changes size (orientation, split
 * view, browser chrome). Keeping this pure makes the canvas behaviour easy to
 * test without a DOM.
 */
export function scaleInkPoints(points: InkPoint[], from: InkDimensions, to: InkDimensions): InkPoint[] {
  if (!from.width || !from.height || (from.width === to.width && from.height === to.height)) return points;
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  return points.map(point => ({ ...point, x: point.x * sx, y: point.y * sy }));
}

/** Remove the newest visible stroke while leaving fading/absorbed gestures alone. */
export function lastVisibleIndex<T extends { fadeStart?: number }>(strokes: T[]): number {
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (strokes[i].fadeStart == null) return i;
  }
  return -1;
}
