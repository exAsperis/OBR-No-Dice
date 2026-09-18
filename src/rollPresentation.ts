import type { RollResult } from './protocol';

/** Keep the previous result in History while a new local roll is revealing. */
export function displayedRolls(history: RollResult[], rolling: boolean) {
  return {
    recent: rolling ? undefined : history.at(-1),
    older: (rolling ? history : history.slice(0, -1)).slice().reverse(),
  };
}

export function chartBarTooltip(value: string, expected: number, ledgerRolls: number, observed?: number) {
  return `${value}: expected ${(expected * 100).toFixed(3)}%`
    + (observed === undefined ? '' : `; observed ${(observed * 100).toFixed(3)}%`)
    + `; ledger rolls ${ledgerRolls}`;
}
