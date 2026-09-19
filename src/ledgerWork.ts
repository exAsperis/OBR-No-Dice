import type { RollResult } from './protocol';
import { displayValue } from './rollService';

export interface LedgerWorkRow { die: string; expression: string; drawIndices?: number[] }

/** Hide only a final stage that merely repeats the already displayed result. */
export function ledgerWorkRows(result: RollResult): LedgerWorkRow[] {
  const steps = result.steps?.length ? result.steps : result.trace;
  const hasExplosions=result.resolution?.dice.some(draw=>draw.kind==='explosion')??false;
  const visible = !hasExplosions&&!result.error && steps.at(-1)?.trim() === displayValue(result.value) ? steps.slice(0, -1) : steps;
  return visible.map((expression, index) => {
    const row: LedgerWorkRow = {
      die: index === 0 || !result.steps?.length || !result.stepDice?.[index] ? '' : `${result.stepDice[index]} →`,
      expression,
    };
    if (result.stepDrawIndices?.[index]?.length) row.drawIndices = result.stepDrawIndices[index];
    return row;
  });
}
