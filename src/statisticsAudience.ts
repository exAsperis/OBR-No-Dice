import type { StoredRoll } from './sessionLedger';

export function filterStatisticsRolls(
  rolls: StoredRoll[],
  includePrivate: boolean,
): StoredRoll[] {
  return includePrivate
    ? rolls
    : rolls.filter(roll => roll.visibility === 'everyone');
}
