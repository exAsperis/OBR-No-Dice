import type { RollResult } from './protocol';
import type { Distribution } from './engine/probability';

/** Keep the previous result in History while a new local roll is revealing. */
export function displayedRolls(history: RollResult[], rolling: boolean) {
  return {
    recent: rolling ? undefined : history.at(-1),
    older: (rolling ? history : history.slice(0, -1)).slice().reverse(),
  };
}

export interface InclusiveTails { low: number; high: number }

/** Entries in a numeric distribution are sorted by value. Keep indices aligned with the chart. */
export function inclusiveTails(entries: Distribution['entries']): (InclusiveTails | undefined)[] {
  if (!entries.every(entry => typeof entry.value === 'number' && Number.isFinite(entry.value))) {
    return entries.map(() => undefined);
  }
  const tails: InclusiveTails[] = entries.map(() => ({ low: 0, high: 0 }));
  let low = 0, high = 0;
  for (let i = 0; i < entries.length; i++) {
    low += entries[i].probability;
    tails[i].low = low;
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    high += entries[i].probability;
    tails[i].high = high;
  }
  return tails;
}

export function chartBarTooltip(value: string, expected: number, observed?: number, tails?: InclusiveTails) {
  return `${value}\nExact: ${(expected * 100).toFixed(3)}%`
    + (tails ? `\nAt or below (≤${value}): ${(tails.low * 100).toFixed(3)}%\nAt or above (≥${value}): ${(tails.high * 100).toFixed(3)}%` : '')
    + (observed === undefined ? '' : `\nObserved: ${(observed * 100).toFixed(3)}%`);
}
