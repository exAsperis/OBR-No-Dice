import { describe, expect, it } from 'vitest';
import { STATISTICS_HELP } from './statisticsHelp';
import { RARITY_THRESHOLDS } from './rarity';

const REQUIRED_KEYS = [
  'expression',
  'expressionRegex',
  'result',
  'rollFilter',
  'rollDie',
  'interpretationCategory',
  'aggregate',
  'mean',
  'median',
  'mode',
  'distribution',
  'relativeFrequency',
  'observedVsExpected',
  'observed',
  'expected',
  'range',
  'distinctOutcomes',
  'distinctFaces',
  'percentile',
  'midpointPercentile',
  'averagePercentile',
  'normalizedResult',
  'referenceDistribution',
  'estimatedPercentile',
  'numericResults',
  'expectedMean',
  'observedMean',
  'deltaMean',
  'expectedRange',
  'observedRange',
  'exactTheoreticalDistribution',
  'dialect',
  'analyzeDieType',
  'naturalMinimum',
  'naturalMaximum',
  'interpretationCategories',
  'observedPercentage',
  'rarityTier',
  'rarestResult',
  'rarestDieFace',
  'rareRepeat',
  'dicePool',
  'explosionChain',
  'highStreak',
  'lowStreak',
  'naturalMaximumStreak',
  'naturalMinimumStreak',
  'fastestRollBurst',
  'bandDuration',
  'normalizedResultSize',
  'population',
  'recentWindow',
  'sample',
  'theoreticalSupport',
  'outsideTheoreticalSupport',
  'differencePercentagePoints',
  'approximate95PercentSampleRange',
  'cumulativeAveragePercentile',
  'expectedPositionMarker',
] as const;

describe('statisticsHelp', () => {
  it('includes the required keys with non-empty definitions', () => {
    for (const key of REQUIRED_KEYS) {
      expect(STATISTICS_HELP[key]).toBeTruthy();
      expect(STATISTICS_HELP[key].trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps rarity thresholds in sync with the active rarity constants', () => {
    const rarityText = STATISTICS_HELP.rarityTier ?? '';
    expect(rarityText).toContain('5%');
    expect(rarityText).toContain('1%');
    expect(rarityText).toContain('0.1%');
    expect(rarityText).toContain('0.01%');
    expect(rarityText).toContain(String(RARITY_THRESHOLDS.unusual * 100));
    expect(rarityText).toContain(String(RARITY_THRESHOLDS.exceptional * 100));
    expect(rarityText).toContain(String(RARITY_THRESHOLDS.extraordinary * 100));
    expect(rarityText).toContain(String(RARITY_THRESHOLDS.legendary * 100));
  });
});
