import type { Node } from './engine/ast';
import type { DieDraw } from './engine/evaluate';
import { distribution, type Distribution } from './engine/probability';
import type { StoredRoll } from './sessionLedger';
import { rarityTier, type RarityTier } from './rarity';
import { inclusiveTails } from './rollPresentation';

export type RollMomentType = 'die-rarity' | 'result-rarity' | 'streak-rarity';
export interface RollMoment {
  type: RollMomentType;
  tier: RarityTier;
  probability: number;
  label: string;
  detail?: string;
  drawIndex?: number;
  streakLength?: number;
}

function diceNodes(node: Node, found = new Map<string, Extract<Node, {kind:'dice'}>>()): Map<string, Extract<Node, {kind:'dice'}>> {
  if (node.kind === 'dice') {
    found.set(`${node.span.start}:${node.span.end}`, node);
    diceNodes(node.quantity, found);
    if (node.die.kind === 'standard-die') diceNodes(node.die.sides, found);
    else for (const facet of node.die.facets) {
      if (facet.kind === 'expression') diceNodes(facet.expression, found);
      if (facet.kind === 'template') for (const segment of facet.segments) if (segment.kind === 'expression') diceNodes(segment.expression, found);
    }
  } else if (node.kind === 'binary') { diceNodes(node.left, found); diceNodes(node.right, found); }
  else if (node.kind === 'pool') for (const item of node.items) diceNodes(item, found);
  else if (node.kind === 'selector') { diceNodes(node.count, found); diceNodes(node.source, found); }
  else if (node.kind === 'group' || node.kind === 'unary' || node.kind === 'resolve') diceNodes(node.value, found);
  else if (node.kind === 'interpret') diceNodes(node.expression, found);
  return found;
}

/** Only static ordered faces can be classified from a draw without guessing its distribution. */
export function dieTailProbability(draw: DieDraw, node: Extract<Node, {kind:'dice'}> | undefined): number | undefined {
  if (!node || typeof draw.face !== 'number' || !Number.isFinite(draw.face)) return undefined;
  let faces: number[];
  if (node.die.kind === 'standard-die') {
    const sides = node.die.sides;
    if (sides.kind !== 'literal' || !Number.isInteger(sides.value) || sides.value < 1 || sides.value > 1000) return undefined;
    if (!Number.isInteger(draw.face) || draw.face < 1 || draw.face > sides.value) return undefined;
    return Math.min(draw.face,sides.value-draw.face+1)/sides.value;
  } else {
    if (node.die.facets.some(facet => facet.kind !== 'value' || typeof facet.value !== 'number' || !Number.isFinite(facet.value))) return undefined;
    faces = node.die.facets.map(facet => (facet as Extract<typeof facet,{kind:'value'}>).value as number);
  }
  if (!faces.includes(draw.face)) return undefined;
  const face = draw.face;
  return Math.min(faces.filter(value => value <= face).length, faces.filter(value => value >= face).length) / faces.length;
}

export function analyzeRollMoments(rolls: StoredRoll[], cache = new Map<string, Distribution | null>()): Map<string, RollMoment[]> {
  const moments = new Map<string, RollMoment[]>();
  const streaks = new Map<string, {value:string;length:number}>();
  const tailsCache = new Map<string, ReturnType<typeof inclusiveTails>>();
  const indexCache = new Map<string, Map<number,number>>();
  for (const roll of [...rolls].sort((a,b)=>a.timestamp-b.timestamp)) {
    const result = roll.result;
    if (result.error) continue;
    const found: RollMoment[] = [];
    const nodes = diceNodes(roll.resolution.ast);
    roll.resolution.dice.forEach((draw, drawIndex) => {
      const node = draw.nodeSpan && nodes.get(`${draw.nodeSpan.start}:${draw.nodeSpan.end}`);
      const probability = dieTailProbability(draw, node);
      if (probability === undefined) return;
      const tier = rarityTier(probability);
      if (tier !== 'ordinary') found.push({type:'die-rarity',tier,probability,label:`${draw.die} → ${draw.face}`,drawIndex});
    });
    const key = roll.normalizedExpression;
    if (!cache.has(key)) {
      try { cache.set(key, distribution(roll.resolution.ast,true)); }
      catch { cache.set(key, null); }
    }
    const chart = cache.get(key);
    const value = roll.finalResult;
    if (chart && typeof value === 'number' && Number.isFinite(value)) {
      if (!indexCache.has(key)) {
        indexCache.set(key,new Map(chart.entries.flatMap((entry,index)=>typeof entry.value==='number'?[[entry.value,index] as const]:[])));
        tailsCache.set(key,inclusiveTails(chart.entries));
      }
      const index = indexCache.get(key)?.get(value) ?? -1;
      if (index >= 0) {
        const tails = tailsCache.get(key)?.[index];
        if (tails) {
          const probability = Math.min(tails.low, tails.high);
          const tier = rarityTier(probability);
          if (tier !== 'ordinary') found.push({type:'result-rarity',tier,probability,label:`Result ${value}`});
        }
        const streakKey = `${roll.rollerId}\u0000${key}`;
        const last = streaks.get(streakKey);
        const length = last?.value === JSON.stringify(value) ? last.length + 1 : 1;
        streaks.set(streakKey,{value:JSON.stringify(value),length});
        if (length >= 2) {
          const probability = chart.entries[index].probability ** (length - 1);
          const tier = rarityTier(probability);
          if (tier !== 'ordinary') found.push({type:'streak-rarity',tier,probability,label:`${length} in a row`,streakLength:length});
        }
      }
    }
    moments.set(roll.id, found);
  }
  return moments;
}
