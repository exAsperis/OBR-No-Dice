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

export const RARITY_COLORS: Record<Exclude<RarityTier,'ordinary'>,string> = {
  unusual: '#e3535a',
  exceptional: '#ee913d',
  extraordinary: '#e4c443',
  legendary: '#ffffff',
};

export const rarityColor = (tier: RarityTier): string | undefined => tier === 'ordinary' ? undefined : RARITY_COLORS[tier];

export const explosionColor = (explosionNumber: number): string => {
  if (explosionNumber <= 1) return RARITY_COLORS.unusual;
  if (explosionNumber === 2) return RARITY_COLORS.exceptional;
  if (explosionNumber === 3) return RARITY_COLORS.extraordinary;
  return RARITY_COLORS.legendary;
};

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
