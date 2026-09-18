import type { RollResult } from './protocol';
import { parse } from './engine/parser';
import { formatShort } from './engine/format';
import type { Value } from './engine/evaluate';
import { resultHeading } from './expressionName';

const display = (value: Value) => Array.isArray(value) ? `[${value.join(', ')}]` : String(value);
const compact = (line: string) => line.length > 100 ? `${line.slice(0, 99)}…` : line;

export interface RevealLine { text: string; final: boolean; die?: string; drawIndices?: number[] }

export function reductionDiff(previous: string, next: string) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let end = 0;
  while (end < previous.length - start && end < next.length - start && previous[previous.length - 1 - end] === next[next.length - 1 - end]) end++;
  return {
    prefix: previous.slice(0, start),
    removed: previous.slice(start, previous.length - end),
    added: next.slice(start, next.length - end),
    suffix: next.slice(next.length - end),
  };
}

export const REVEAL_LINE_INTERVAL_MS = 500;
export const nextRevealCount = (current: number, total: number) => Math.min(total, current + 1);

export function revealLines(result: RollResult): RevealLine[] {
  let short = result.expression;
  try { short = result.steps?.[0] ?? formatShort(parse(result.expression, result.dialect)); } catch { /* Original remains readable. */ }
  const work = (result.steps?.slice(1) ?? result.trace).map((text, index) => ({
    text: compact(text), final: false,
    ...(result.stepDice?.[index + 1] ? { die: `${result.stepDice[index + 1]} →` } : {}),
    ...(result.stepDrawIndices?.[index + 1]?.length ? { drawIndices: result.stepDrawIndices[index + 1] } : {}),
  }));
  return [
    { text: compact(short), final: false },
    ...work,
    { text: result.error ? `ERROR: ${result.error}` : `${resultHeading(result.expression)}: ${display(result.value)}${result.interpretation ? ` · ${result.interpretation}` : ''}`, final: true },
  ];
}
