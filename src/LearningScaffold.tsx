import type { LearningScaffold as Scaffold } from './curriculum';

export const scaffoldLabel = (model: Scaffold): string => {
  if (model.kind === 'combine') return `${model.groups[0]} counters and ${model.groups[1]} counters to count together`;
  if (model.kind === 'take-away') return `${model.total} counters with ${model.remove} crossed out`;
  if (model.kind === 'ten-frame') return `A ten-frame with ${model.filled} spaces filled`;
  if (model.kind === 'count-on') return `A number line from ${model.start} to ${model.end}; count the jumps`;
  return `${model.groups} equal groups with ${model.each} counters in each group`;
};

function Counters({ count, crossed = 0 }: { count: number; crossed?: number }) {
  return <span className="counter-group" aria-hidden>
    {Array.from({ length: count }, (_, index) =>
      <i key={index} className={index >= count - crossed ? 'crossed' : ''} />)}
  </span>;
}

export function LearningScaffold({ model }: { model: Scaffold }) {
  return <figure className={`learning-scaffold ${model.kind}`} role="img" aria-label={scaffoldLabel(model)}>
    <figcaption>try it this way</figcaption>
    {model.kind === 'combine' && <div className="scaffold-row">
      <Counters count={model.groups[0]} /><b aria-hidden>+</b><Counters count={model.groups[1]} /><b aria-hidden>= ?</b>
    </div>}
    {model.kind === 'take-away' && <div className="scaffold-row">
      <Counters count={model.total} crossed={model.remove} /><b aria-hidden>= ?</b>
    </div>}
    {model.kind === 'ten-frame' && <div className="ten-frame" aria-hidden>
      {Array.from({ length: 10 }, (_, index) => <i key={index} className={index < model.filled ? 'filled' : ''} />)}
    </div>}
    {model.kind === 'count-on' && <div className="number-line" aria-hidden>
      {Array.from({ length: model.end - model.start + 1 }, (_, index) =>
        <span key={index}><i />{model.start + index}</span>)}
    </div>}
    {model.kind === 'equal-groups' && <div className="equal-groups" aria-hidden>
      {Array.from({ length: model.groups }, (_, index) =>
        <span className="equal-group" key={index}><Counters count={model.each} /></span>)}
      <b>= ?</b>
    </div>}
  </figure>;
}
