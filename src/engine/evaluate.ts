import { ExpressionError, type Facet, type Node } from './ast';

export interface Rng { integer(maxExclusive: number): number }
export const cryptoRng: Rng = { integer(maxExclusive) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1) throw new Error('Invalid random range');
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const bytes = new Uint32Array(1); let n: number;
  do { crypto.getRandomValues(bytes); n = bytes[0]; } while (n >= limit);
  return n % maxExclusive;
} };
export type Value = Facet | Facet[];
export interface Evaluation { value: Value; trace: string[] }
const show = (v: Value) => Array.isArray(v) ? `[${v.join(', ')}]` : String(v);
const numeric = (v: Value): number => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new ExpressionError('This operation requires a numeric value'); return v; };
const pool = (v: Value): Facet[] => Array.isArray(v) ? v : [v];
const add = (a: number, b: number, op: string) => { const n = op === '+' ? a+b : op === '-' ? a-b : op === '*' ? a*b : a/b; if (!Number.isFinite(n)) throw new ExpressionError('Non-finite arithmetic result'); return n; };
export function evaluate(node: Node, rng: Rng = cryptoRng): Evaluation {
  switch (node.kind) {
    case 'literal': return { value: node.value, trace: [] };
    case 'unary': { const e = evaluate(node.value, rng); const v = -numeric(e.value); return { value: v, trace: [...e.trace, `−${show(e.value)} → ${v}`] }; }
    case 'die': {
      const c = numeric(evaluate(node.count, rng).value); if (!Number.isInteger(c) || c < 1 || c > 100) throw new ExpressionError('Dice count must be an integer from 1 to 100');
      const results: Facet[] = []; const trace: string[] = [];
      const max = node.facets[node.facets.length-1];
      if (node.explode && typeof max !== 'number') throw new ExpressionError('Exploding dice require numeric facets');
      for (let i=0;i<c;i++) {
        let facet = node.facets[rng.integer(node.facets.length)]; let total = numericOrFacet(facet);
        trace.push(`die ${i+1} → ${show(facet)}`);
        if(node.reroll) {
          const {once,comparator,target}=node.reroll;
          const matches=(value:Facet)=>{ const n=numeric(value); return comparator==='='?n===target:comparator==='<'?n<target:comparator==='<='?n<=target:comparator==='>'?n>target:n>=target; };
          let tries=0;
          while(matches(facet)) { if(++tries>100) throw new ExpressionError('Reroll limit reached'); facet=node.facets[rng.integer(node.facets.length)]; total=facet; trace.push(`reroll → ${show(facet)}`); if(once)break; }
        }
        if (node.explode) {
          let explosions=0;
          while (facet === max) { if (++explosions > 100) throw new ExpressionError('Explosion limit reached'); facet = node.facets[rng.integer(node.facets.length)]; trace.push(`explode → ${show(facet)}`); total = numeric(total) + numeric(facet); }
          trace.push(`die ${i+1} total → ${show(total)}`);
        }
        results.push(total);
      }
      return { value: results, trace: [`${c}d{${node.facets.join(',')}} → ${show(results)}`, ...trace] };
    }
    case 'pool': { const es = node.items.map(n => evaluate(n, rng)); const values = es.flatMap(e => pool(e.value)); return { value: values, trace: [...es.flatMap(e=>e.trace), `pool → ${show(values)}`] }; }
    case 'sum': { const e = evaluate(node.value, rng); const v = pool(e.value).reduce<number>((a,b)=>a+numeric(b),0); return { value:v, trace:[...e.trace, `sum → ${v}`] }; }
    case 'keep': {
      const e = evaluate(node.value, rng); const n = numeric(evaluate(node.count, rng).value); if (!Number.isInteger(n) || n < 0) throw new ExpressionError('Keep/drop count must be a nonnegative integer');
      const values = pool(e.value); const rank = (v: Facet) => typeof v === 'number' ? v : node.value.kind === 'die' ? node.value.facets.indexOf(v) : NaN;
      if (values.some(v=>!Number.isFinite(rank(v)))) throw new ExpressionError('Cannot rank mixed or unrelated symbolic facets');
      const sorted = values.map((v,i)=>({v,i})).sort((a,b)=>rank(a.v)-rank(b.v));
      const take = node.mode === 'H' ? sorted.slice(-n) : node.mode === 'L' ? sorted.slice(0,n) : node.mode === 'DH' ? sorted.slice(0,Math.max(0,sorted.length-n)) : sorted.slice(Math.min(n,sorted.length));
      const result = take.sort((a,b)=>a.i-b.i).map(x=>x.v);
      return { value:result, trace:[...e.trace, `${node.mode}${n} → ${show(result)}`] };
    }
    case 'binary': {
      const left=evaluate(node.left,rng), right=evaluate(node.right,rng);
      const resolve = (v:Value) => Array.isArray(v) ? v.reduce<number>((a,b)=>a+numeric(b),0) : numeric(v);
      const a=resolve(left.value), b=resolve(right.value), value=add(a,b,node.op);
      return { value, trace:[...left.trace,...right.trace,`${a} ${node.op} ${b} → ${value}`] };
    }
  }
}
function numericOrFacet(v: Facet): Facet { return v; }
export function roll(node: Node, rng: Rng = cryptoRng): Evaluation {
  const result = evaluate(node, rng);
  if (!Array.isArray(result.value)) return result;
  if (result.value.length === 1 && typeof result.value[0] === 'string') return { value: result.value[0], trace: result.trace };
  if (result.value.every(v => typeof v === 'number')) {
    const value = result.value.reduce<number>((sum, v) => sum + (v as number), 0);
    return { value, trace: [...result.trace, `sum → ${value}`] };
  }
  return result;
}
