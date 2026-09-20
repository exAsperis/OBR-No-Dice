import { describe, expect, it } from 'vitest';
import type { StoredRoll } from './sessionLedger';
import { filterStatisticsRolls } from './statisticsAudience';

const roll = (visibility: StoredRoll['visibility']) => ({ visibility } as StoredRoll);

describe('filterStatisticsRolls', () => {
  it('excludes self and gm rolls while including everyone rolls when unchecked', () => {
    const rolls = [roll('self'), roll('gm'), roll('everyone')];

    expect(filterStatisticsRolls(rolls, false)).toEqual([roll('everyone')]);
  });

  it('includes all visible roll types when checked', () => {
    const rolls = [roll('self'), roll('gm'), roll('everyone')];

    expect(filterStatisticsRolls(rolls, true)).toBe(rolls);
  });

  it('does not mutate the input data', () => {
    const rolls = [roll('self'), roll('gm'), roll('everyone')];
    const snapshot = [...rolls];

    filterStatisticsRolls(rolls, false);

    expect(rolls).toEqual(snapshot);
  });
});
