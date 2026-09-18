import type { Node } from './engine/ast';

export interface DieOverride { die: string; value: number }

export function validDieOverride(item: DieOverride): boolean {
  const match = /^d([1-9]\d*)$/.exec(item.die);
  if (!match) return false;
  const sides = Number(match[1]);
  return Number.isInteger(sides) && sides <= 1000 && Number.isInteger(item.value) && item.value >= 1 && item.value <= sides;
}

/** A configured dN matches a literal dN or the conventional custom faces 1..N. */
export function overrideFacetIndex(node: Extract<Node,{kind:'dice'}>, faceCount: number, overrides: readonly DieOverride[]): number | undefined {
  const die = node.die;
  let sides: number;
  if (die.kind === 'standard-die') {
    if (die.sides.kind !== 'literal' || die.sides.value !== faceCount) return undefined;
    sides = faceCount;
  } else {
    sides = die.facets.length;
    const values = die.facets.map(facet => facet.kind === 'value' ? facet.value : undefined);
    if (values.length !== faceCount || !values.every(value => typeof value === 'number' && Number.isInteger(value))
      || new Set(values).size !== faceCount || !values.every(value => (value as number) >= 1 && (value as number) <= faceCount)) return undefined;
  }
  const override = overrides.find(item => item.die === `d${sides}`);
  if (!override) return undefined;
  if (!validDieOverride(override)) throw new Error(`Invalid override for ${override.die}`);
  if (die.kind === 'standard-die') return override.value - 1;
  const index = die.facets.findIndex(facet => facet.kind === 'value' && facet.value === override.value);
  return index >= 0 ? index : undefined;
}
