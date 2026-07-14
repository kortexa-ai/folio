import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LearningScaffold, scaffoldLabel } from './LearningScaffold';

describe('learning scaffold labels', () => {
  it('describes every visual model without giving the answer', () => {
    expect(scaffoldLabel({ kind: 'combine', groups: [4, 3] })).toBe('4 counters and 3 counters to count together');
    expect(scaffoldLabel({ kind: 'take-away', total: 8, remove: 5 })).toBe('8 counters with 5 crossed out');
    expect(scaffoldLabel({ kind: 'ten-frame', filled: 6 })).toBe('A ten-frame with 6 spaces filled');
    expect(scaffoldLabel({ kind: 'count-on', start: 4, end: 10 })).toBe('A number line from 4 to 10; count the jumps');
    expect(scaffoldLabel({ kind: 'equal-groups', groups: 3, each: 4 })).toBe('3 equal groups with 4 counters in each group');
  });

  it('renders complete ten-frames and large equal-group models', () => {
    const frame = renderToStaticMarkup(LearningScaffold({ model: { kind: 'ten-frame', filled: 6 } }));
    expect(frame.match(/<i/g)).toHaveLength(10);
    expect(frame.match(/class="filled"/g)).toHaveLength(6);

    const groups = renderToStaticMarkup(LearningScaffold({ model: { kind: 'equal-groups', groups: 9, each: 10 } }));
    expect(groups.match(/class="equal-group"/g)).toHaveLength(9);
    expect(groups.match(/<i/g)).toHaveLength(90);
  });
});
