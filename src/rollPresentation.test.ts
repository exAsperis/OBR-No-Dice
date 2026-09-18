import { describe, expect, it } from 'vitest';
import type { RollResult } from './protocol';
import { distribution } from './engine/probability';
import { parse } from './engine/parser';
import { chartBarTooltip, displayedRolls, inclusiveTails } from './rollPresentation';

const roll = (requestId: string) => ({ requestId }) as RollResult;

describe('roll presentation', () => {
  it('moves the previous result into History while a new roll is revealing', () => {
    const first = roll('first'), second = roll('second');
    expect(displayedRolls([first, second], false)).toEqual({ recent: second, older: [first] });
    expect(displayedRolls([first, second], true)).toEqual({ recent: undefined, older: [second, first] });
    expect(displayedRolls([first, second, roll('third')], false).recent?.requestId).toBe('third');
  });

  it('shows observed percent only while observation data is displayed', () => {
    expect(chartBarTooltip('7', .25)).toBe('7\nExact: 25.000%');
    expect(chartBarTooltip('7', .25, .2)).toBe('7\nExact: 25.000%\nObserved: 20.000%');
    expect(chartBarTooltip('7', .25, 0)).toContain('Observed: 0.000%');
    expect(chartBarTooltip('7', .25, .2)).not.toContain('ledger rolls');
  });

  it('calculates inclusive tails for fair d20 outcomes', () => {
    const chart = distribution(parse('d20'));
    const tails = inclusiveTails(chart.entries);
    for (const [value, low, high] of [[1, .05, 1], [10, .5, .55], [20, 1, .05]]) {
      const index = chart.entries.findIndex(entry => entry.value === value);
      expect(chart.entries[index].probability).toBeCloseTo(.05);
      expect(tails[index]?.low).toBeCloseTo(low);
      expect(tails[index]?.high).toBeCloseTo(high);
    }
  });

  it('calculates asymmetric and extreme 2d6 tails', () => {
    const chart = distribution(parse('2d6'));
    const tails = inclusiveTails(chart.entries);
    const at = (value: number) => tails[chart.entries.findIndex(entry => entry.value === value)];
    expect(at(2)?.low).toBeCloseTo(1 / 36);
    expect(at(2)?.high).toBeCloseTo(1);
    expect(at(5)?.low).toBeCloseTo(10 / 36);
    expect(at(5)?.high).toBeCloseTo(30 / 36);
    expect(at(12)?.low).toBeCloseTo(1);
    expect(at(12)?.high).toBeCloseTo(1 / 36);
  });

  it('uses the complete distribution beyond the visible 200 bars', () => {
    const entries = Array.from({ length: 201 }, (_, value) => ({ value, probability: 1 / 201 }));
    const tails = inclusiveTails(entries);
    expect(tails[0]?.high).toBeCloseTo(1);
    expect(tails[199]?.high).toBeCloseTo(2 / 201);
  });

  it('omits tails for non-numeric outcomes', () => {
    const tails = inclusiveTails([{ value: 'heads', probability: .5 }, { value: 'tails', probability: .5 }]);
    expect(tails).toEqual([undefined, undefined]);
    expect(chartBarTooltip('heads', .5, undefined, tails[0])).toBe('heads\nExact: 50.000%');
  });
});
