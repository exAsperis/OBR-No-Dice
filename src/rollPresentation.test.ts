import { describe, expect, it } from 'vitest';
import type { RollResult } from './protocol';
import { chartBarTooltip, displayedRolls } from './rollPresentation';

const roll = (requestId: string) => ({ requestId }) as RollResult;

describe('roll presentation', () => {
  it('moves the previous result into History while a new roll is revealing', () => {
    const first = roll('first'), second = roll('second');
    expect(displayedRolls([first, second], false)).toEqual({ recent: second, older: [first] });
    expect(displayedRolls([first, second], true)).toEqual({ recent: undefined, older: [second, first] });
    expect(displayedRolls([first, second, roll('third')], false).recent?.requestId).toBe('third');
  });

  it('shows observed percent only while observation data is displayed', () => {
    expect(chartBarTooltip('7', .25, 3)).toBe('7: expected 25.000%; ledger rolls 3');
    expect(chartBarTooltip('7', .25, 3, .2)).toBe('7: expected 25.000%; observed 20.000%; ledger rolls 3');
    expect(chartBarTooltip('7', .25, 3, 0)).toContain('observed 0.000%');
  });
});
