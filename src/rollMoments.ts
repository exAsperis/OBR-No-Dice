export interface RollMoment {
  type: 'rarity' | 'streak';
  tier: RarityTier;
  probability: number;
  label: string;
  detail?: string;
}