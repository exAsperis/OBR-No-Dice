import { describe, expect, it } from 'vitest';
import { FAIRNESS_MAX_ROLLS_PER_SECOND, fairnessRollsPerSecond } from './fairnessPacing';

describe('fairness pacing', () => {
  it('doubles the rate until it reaches the cap', () => {
    expect(fairnessRollsPerSecond(0)).toBe(2);
    expect(fairnessRollsPerSecond(850)).toBe(4);
    expect(fairnessRollsPerSecond(1700)).toBe(8);
    expect(fairnessRollsPerSecond(10000)).toBe(FAIRNESS_MAX_ROLLS_PER_SECOND);
    expect(fairnessRollsPerSecond(20000)).toBe(FAIRNESS_MAX_ROLLS_PER_SECOND);
  });
});
