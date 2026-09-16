// Start at a pace people can follow, then double the sampling rate every 850 ms.
export const FAIRNESS_INITIAL_ROLLS_PER_SECOND = 2;
export const FAIRNESS_DOUBLING_MS = 850;
export const FAIRNESS_MAX_ROLLS_PER_SECOND = 2048;

export function fairnessRollsPerSecond(elapsedMs: number): number {
  return Math.min(
    FAIRNESS_MAX_ROLLS_PER_SECOND,
    FAIRNESS_INITIAL_ROLLS_PER_SECOND * 2 ** (Math.max(0, elapsedMs) / FAIRNESS_DOUBLING_MS),
  );
}
