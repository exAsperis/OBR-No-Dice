export type RarityTier =
  | 'ordinary'
  | 'unusual'
  | 'exceptional'
  | 'extraordinary'
  | 'legendary';

export const RARITY_THRESHOLDS = {
    unusual: 0.05,
    exceptional: 0.01,
    extraordinary: 0.001,
    legendary: 0.0001,
} as const;

export function rarityTier(probability: number): RarityTier {
  if (probability <= RARITY_THRESHOLDS.legendary) return 'legendary';
  if (probability <= RARITY_THRESHOLDS.extraordinary) return 'extraordinary';
  if (probability <= RARITY_THRESHOLDS.exceptional) return 'exceptional';
  if (probability <= RARITY_THRESHOLDS.unusual) return 'unusual';
  return 'ordinary';
}

const RARITY_ORDER: RarityTier[] = ['ordinary','unusual','exceptional','extraordinary','legendary'];
export function rarestTier(tiers: RarityTier[]): RarityTier {
  return tiers.reduce((best,tier)=>RARITY_ORDER.indexOf(tier)>RARITY_ORDER.indexOf(best)?tier:best,'ordinary' as RarityTier);
}
