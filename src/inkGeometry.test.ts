import { describe, expect, it } from 'vitest';
import { lastVisibleIndex, scaleInkPoints } from './inkGeometry';

describe('ink geometry', () => {
  it('scales ink with a resized notebook page', () => {
    const points = [{ x: 25, y: 40, pressure: 0.5 }];
    expect(scaleInkPoints(points, { width: 100, height: 200 }, { width: 200, height: 100 }))
      .toEqual([{ x: 50, y: 20, pressure: 0.5 }]);
  });

  it('keeps the same point array when dimensions did not change', () => {
    const points = [{ x: 1, y: 2, pressure: 0.3 }];
    expect(scaleInkPoints(points, { width: 10, height: 20 }, { width: 10, height: 20 })).toBe(points);
  });

  it('finds the newest visible stroke', () => {
    expect(lastVisibleIndex([{ fadeStart: undefined }, { fadeStart: 12 }, { fadeStart: undefined }])).toBe(2);
    expect(lastVisibleIndex([{ fadeStart: undefined }, { fadeStart: 12 }])).toBe(0);
    expect(lastVisibleIndex([{ fadeStart: 12 }])).toBe(-1);
  });
});
