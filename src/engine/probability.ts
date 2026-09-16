import { ExpressionError, type Facet, type Node } from './ast';
import { roll, type Value } from './evaluate';

export const MAX_STATES = 30000;
export const ESTIMATE_TRIALS = 20000;
export interface Distribution { entries: { value: Value; probability: number }[]; exact: boolean; trials?: number; mean?: number; mode?: Value; range?: [number,number] }
type PMF = Map<string,{ value: Value; p: number }>;
const key = (v: Value) => JSON.stringify(v);
const put = (map:PMF, v:Value,p:number) => { const k=key(v), old=map.get(k); map.set(k,{value:v,p:(old?.p??0)+p}); if(map.size>MAX_STATES) throw new Error('state limit'); };
const num = (v: Value):number => { if(typeof v!=='number') throw new ExpressionError('Numeric value required'); return v; };
const list = (v:Value): Facet[] => Array.isArray(v)?v:[v];
const singleton=(v:Value):PMF=>new Map([[key(v),{value:v,p:1}]]);
function combine(a:PMF,b:PMF, fn:(x:Value,y:Value)=>Value):PMF { if(a.size*b.size>MAX_STATES*8) throw new Error('state limit'); const out:PMF=new Map(); for(const x of a.values()) for(const y of b.values()) put(out,fn(x.value,y.value),x.p*y.p); return out; }
function exact(node:Node):PMF {
  switch(node.kind) {
    case 'literal': return singleton(node.value);
    case 'unary': { const out:PMF=new Map(); for(const e of exact(node.value).values()) put(out,-num(e.value),e.p); return out; }
    case 'die': {
      if(node.explode || node.reroll) throw new Error('infinite distribution');
      const counts=exact(node.count); const out:PMF=new Map();
      for(const c of counts.values()) {
        const n=num(c.value); if(!Number.isInteger(n)||n<1||n>100) throw new ExpressionError('Dice count must be 1–100');
        let rolls=singleton([]);
        const face:PMF=new Map(); for(const f of node.facets) put(face,f,1/node.facets.length);
        for(let i=0;i<n;i++) rolls=combine(rolls,face,(a,b)=>[...list(a),numOrFacet(b)]);
        for(const r of rolls.values()) put(out,r.value,r.p*c.p);
      }
      return out;
    }
    case 'pool': { let out=singleton([]); for(const item of node.items) out=combine(out,exact(item),(a,b)=>[...list(a),...list(b)]); return out; }
    case 'sum': { const out:PMF=new Map(); for(const e of exact(node.value).values()) put(out,list(e.value).reduce<number>((a,b)=>a+num(b),0),e.p); return out; }
    case 'keep': {
      const count=exact(node.count), base=exact(node.value), out:PMF=new Map();
      for(const c of count.values()) for(const b of base.values()) {
        const n=num(c.value); if(!Number.isInteger(n)||n<0) throw new ExpressionError('Invalid keep/drop count');
        const values=list(b.value); const rank=(v:Facet)=>typeof v==='number'?v:node.value.kind==='die'?node.value.facets.indexOf(v):NaN;
        if(values.some(v=>!Number.isFinite(rank(v)))) throw new ExpressionError('Cannot rank these facets');
        const sorted=values.map((v,i)=>({v,i})).sort((x,y)=>rank(x.v)-rank(y.v));
        const selected=node.mode==='H'?sorted.slice(-n):node.mode==='L'?sorted.slice(0,n):node.mode==='DH'?sorted.slice(0,Math.max(0,sorted.length-n)):sorted.slice(Math.min(n,sorted.length));
        put(out,selected.sort((x,y)=>x.i-y.i).map(x=>x.v),b.p*c.p);
      } return out;
    }
    case 'binary': return combine(exact(node.left),exact(node.right),(a,b)=>{
      const resolve=(v:Value)=>Array.isArray(v)?v.reduce<number>((s,x)=>s+num(x),0):num(v);
      const x=resolve(a),y=resolve(b); const result=node.op==='+'?x+y:node.op==='-'?x-y:node.op==='*'?x*y:x/y;
      if(!Number.isFinite(result)) throw new ExpressionError('Non-finite arithmetic result'); return result;
    });
  }
}
function numOrFacet(v:Value):Facet { if(Array.isArray(v)) throw new ExpressionError('Nested pool'); return v; }
export function distribution(node:Node):Distribution {
  let pmf:PMF; let exactResult=true;
  try { pmf=exact(node); } catch(e) {
    if(e instanceof ExpressionError) throw e;
    exactResult=false; pmf=new Map(); const rng={integer:(n:number)=>Math.floor(Math.random()*n)};
    for(let i=0;i<ESTIMATE_TRIALS;i++) { try { put(pmf,roll(node,rng).value,1/ESTIMATE_TRIALS); } catch(err) { if(err instanceof ExpressionError) throw err; } }
  }
  if (exactResult) {
    const resolved: PMF = new Map();
    for (const e of pmf.values()) {
      const value = Array.isArray(e.value) && e.value.every(v=>typeof v==='number') ? e.value.reduce<number>((a,b)=>a+(b as number),0) : Array.isArray(e.value) && e.value.length===1 ? e.value[0] : e.value;
      put(resolved,value,e.p);
    }
    pmf=resolved;
  }
  const entries=[...pmf.values()].map(x=>({value:x.value,probability:x.p})).sort((a,b)=>typeof a.value==='number'&&typeof b.value==='number'?a.value-b.value:String(a.value).localeCompare(String(b.value)));
  const numeric=entries.every(e=>typeof e.value==='number');
  const mean=numeric?entries.reduce((s,e)=>s+(e.value as number)*e.probability,0):undefined;
  const mode=entries.reduce((a,b)=>b.probability>a.probability?b:a,entries[0])?.value;
  const range=numeric&&entries.length?[entries[0].value as number,entries[entries.length-1].value as number] as [number,number]:undefined;
  return {entries,exact:exactResult,trials:exactResult?undefined:ESTIMATE_TRIALS,mean,mode,range};
}
