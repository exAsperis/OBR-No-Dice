import type { Node } from './engine/ast';
import { formatShort } from './engine/format';
import { parse } from './engine/parser';

export interface DieOverride { die: string; values?: number[]; /** Legacy room metadata. */ value?: number }

type DiceNode = Extract<Node, { kind: 'dice' }>;

function numericFaces(node: DiceNode): number[] | undefined {
  if (node.die.kind === 'standard-die') {
    const sides = node.die.sides;
    if (sides.kind !== 'literal' || !Number.isInteger(sides.value) || sides.value < 1 || sides.value > 1000) return undefined;
    return Array.from({ length: sides.value }, (_, index) => index + 1);
  }
  const faces = node.die.facets.map(facet => facet.kind === 'value' && typeof facet.value === 'number' && Number.isFinite(facet.value)
    ? facet.value : undefined);
  return faces.every((face): face is number => face !== undefined) ? faces : undefined;
}

const faceKey = (faces: readonly number[]) => JSON.stringify(faces);

/** Parse a plain, static numeric die term and return its canonical display and ordered faces. */
export function normalizeOverrideDie(source: string): { die: string; faces: number[]; key: string } | undefined {
  try {
    const node = parse(source.trim().toLowerCase());
    if (node.kind !== 'dice' || node.quantity.kind !== 'literal' || node.quantity.value !== 1 || node.reroll) return undefined;
    const faces = numericFaces(node);
    if (!faces || node.die.kind === 'standard-die' && (node.die.explodeHighest || node.die.rerollLowest)) return undefined;
    if (node.die.kind === 'custom-die' && node.die.facets.some(facet => facet.explosion || facet.facetReroll)) return undefined;
    return { die: formatShort(node), faces, key: faceKey(faces) };
  } catch { return undefined; }
}

export function validDieOverride(item: DieOverride): boolean {
  const normalized = item && typeof item.die === 'string' ? normalizeOverrideDie(item.die) : undefined;
  const values = overrideValues(item);
  return !!normalized && values.length > 0 && values.length <= 1000
    && values.every(value => typeof value === 'number' && Number.isFinite(value) && normalized.faces.includes(value));
}

export const overrideValues = (item: DieOverride): number[] => Array.isArray(item.values) ? item.values
  : item.value !== undefined ? [item.value] : [];

/** Accept old single-value room metadata while normalizing all current settings. */
export function normalizeDieOverride(item: unknown): DieOverride | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const candidate = item as { die?: unknown; values?: unknown; value?: unknown };
  if (typeof candidate.die !== 'string') return undefined;
  const normalized = normalizeOverrideDie(candidate.die);
  const values = Array.isArray(candidate.values) ? candidate.values : candidate.value !== undefined ? [candidate.value] : [];
  const result = normalized ? { die: normalized.die, values: [...values] as number[] } : undefined;
  return result && validDieOverride(result) ? result : undefined;
}

/** Every matching draw advances that die term's repeating value sequence. */
export function createDieOverrideResolver(overrides: readonly DieOverride[]) {
  const prepared = new Map<string, { values: number[] }>();
  for (const item of overrides) {
    const normalized = normalizeOverrideDie(item.die);
    if (!normalized || !validDieOverride(item)) throw new Error(`Invalid override for ${item.die}`);
    if (prepared.has(normalized.key)) throw new Error(`Duplicate override for ${item.die}`);
    prepared.set(normalized.key, { values: [...overrideValues(item)] });
  }
  const positions = new Map<string, number>();
  return ({ node, faceCount }: { node: DiceNode; faceCount: number }): number | undefined => {
    const faces = numericFaces(node);
    if (!faces || faces.length !== faceCount) return undefined;
    const key = faceKey(faces), override = prepared.get(key);
    if (!override) return undefined;
    const position = positions.get(key) ?? 0;
    const value = override.values[position % override.values.length];
    positions.set(key, position + 1);
    const index = faces.indexOf(value);
    return index >= 0 ? index : undefined;
  };
}

export function overrideFacetIndex(node: DiceNode, faceCount: number, overrides: readonly DieOverride[]): number | undefined {
  return createDieOverrideResolver(overrides)({ node, faceCount });
}
