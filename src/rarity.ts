export type RarityTier =
  | 'ordinary'
  | 'unusual'
  | 'exceptional'
  | 'extraordinary'
  | 'legendary';

export function rarityTier(probability: number): RarityTier {
  if (probability <= 0.0001) return 'legendary';
  if (probability <= 0.001) return 'extraordinary';
  if (probability <= 0.01) return 'exceptional';
  if (probability <= 0.05) return 'unusual';
  return 'ordinary';
}