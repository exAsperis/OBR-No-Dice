/** All metadata keys and Owlbear registrations must derive from this ID. */
export const EXTENSION_ID = "com.ex-asperis.no-dice";

export const EXTENSION_NAME = "No Dice";

export const RARITY_THRESHOLDS = {
    unusual: 0.05,
    exceptional: 0.01,
    extraordinary: 0.001,
    legendary: 0.0001,
} as const;