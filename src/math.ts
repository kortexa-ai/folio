export type Operation = 'add' | 'subtract' | 'multiply';
export type Problem = { left: number; right: number; operation: Operation; answer: number };

const symbol: Record<Operation, string> = { add: '+', subtract: '−', multiply: '×' };
export const formatProblem = (p: Problem) => `${p.left} ${symbol[p.operation]} ${p.right}`;

export function makeProblem(operation: Operation, random = Math.random): Problem {
  let left = Math.floor(random() * 9) + 1;
  let right = Math.floor(random() * 9) + 1;
  if (operation === 'subtract' && right > left) [left, right] = [right, left];
  const answer = operation === 'add' ? left + right : operation === 'subtract' ? left - right : left * right;
  return { left, right, operation, answer };
}

export function deterministicHint(p: Problem, attempt: number) {
  if (p.operation === 'add') return attempt > 1 ? `Start at ${p.left}, then count ${p.right} more.` : `Try drawing ${p.right} dots beside ${p.left} dots.`;
  if (p.operation === 'subtract') return attempt > 1 ? `Count up from ${p.right} to ${p.left}. How many jumps?` : `Draw ${p.left} marks and cross out ${p.right}.`;
  return attempt > 1 ? `Add ${p.left} to itself ${p.right} times.` : `Draw ${p.right} groups with ${p.left} dots in each.`;
}

export function nextOperation(solved: Record<Operation, number>): Operation {
  if (solved.add < 5) return 'add';
  if (solved.subtract < 5) return 'subtract';
  return 'multiply';
}
