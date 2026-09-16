import { ExpressionError, type Explosion, type Facet, type Node } from './ast';
import { roll, type Value } from './evaluate';
import { resolveSemantics } from './semantics';
export const MAX_STATES=30000;
export const ESTIMATE_TRIALS=20000;
export interface Distribution { entries:{value:Value;probability:number}[];exact:boolean;trials?:number;mean?:number;mode?:Value;range?:[number,number] }
type PMF=Map<string,{value:Value;p:number}>;
type FaceOutcome={value:Facet;p:number;explosion?:Explosion};
type Context='scalar'|'pool-source';
const key=(v:Value)=>JSON.stringify(v);
const put=(out:PMF,value:Value,p:number)=>{const k=key(value),old=out.get(k);out.set(k,{value,p:(old?.p??0)+p});if(out.size>MAX_STATES)throw new Error('state limit');};
const only=(value:Value):PMF=>new Map([[key(value),{value,p:1}]]);
const scalar=(value:Value):number=>{if(typeof value!=='number')throw new ExpressionError('Numeric scalar required');return value;};
const members=(value:Value):Facet[]=>Array.isArray(value)?value:[value];
const combine=(a:PMF,b:PMF,fn:(x:Value,y:Value)=>Value):PMF=>{if(a.size*b.size>MAX_STATES*8)throw new Error('state limit');const out:PMF=new Map();for(const x of a.values())for(const y of b.values())put(out,fn(x.value,y.value),x.p*y.p);return out;};
function ranks(node:Node):Map<string,number>{
  if(node.kind==='dice'&&node.die.kind==='custom-die'){const ranks=new Map<string,number>();for(const facet of node.die.facets)if(facet.kind==='value'&&typeof facet.value==='string'&&!ranks.has(facet.value))ranks.set(facet.value,ranks.size);return ranks;}
  if(node.kind==='pool'){const result=new Map<string,number>();for(const child of node.items)for(const [k,v] of ranks(child))result.set(k,v);return result;}
  if(node.kind==='group'||node.kind==='resolve')return ranks(node.value);
  if(node.kind==='selector')return ranks(node.source);
  return new Map();
}
function exact(root:Node):PMF{
  const plan=resolveSemantics(root);
  const cache=new WeakMap<Node,Map<Context,PMF>>();
  const visit=(node:Node,context:Context):PMF=>{
    const cached=cache.get(node)?.get(context);if(cached)return cached;
    let result:PMF;
    switch(node.kind){
      case 'literal':result=only(node.value);break;
      case 'group':result=visit(node.value,context);break;
      case 'unary':{result=new Map();for(const item of visit(node.value,'scalar').values())put(result,-scalar(item.value),item.p);break;}
      case 'binary':result=combine(visit(node.left,'scalar'),visit(node.right,'scalar'),(a,b)=>{const x=scalar(a),y=scalar(b),n=node.op==='+'?x+y:node.op==='-'?x-y:node.op==='*'?x*y:x/y;if(!Number.isFinite(n))throw new ExpressionError('Non-finite arithmetic result');return n;});break;
      case 'dice':{
        if(node.reroll)throw new Error('reroll distribution');
        result=new Map();const counts=visit(node.quantity,'scalar');
        const sides=node.die.kind==='standard-die'?visit(node.die.sides,'scalar'):only(0);
        for(const count of counts.values())for(const side of sides.values()){
          const n=scalar(count.value),s=scalar(side.value);
          if(!Number.isInteger(n)||n<1||n>100)throw new ExpressionError('Invalid dice quantity');
          const faceCount=node.die.kind==='custom-die'?node.die.facets.length:s;
          if(!Number.isInteger(faceCount)||faceCount<1||faceCount>1000)throw new ExpressionError('Invalid die size');
          const faces:FaceOutcome[]=[];
          if(node.die.kind==='standard-die')for(let face=1;face<=faceCount;face++)faces.push({value:face,p:1/faceCount,explosion:face===faceCount?node.die.explodeHighest:undefined});
          else for(const facet of node.die.facets){
            if(facet.kind==='value'){faces.push({value:facet.value,p:1/faceCount,explosion:facet.explosion});continue;}
            if(facet.kind==='expression'){
              for(const outcome of visit(facet.expression,'scalar').values()){
                if(Array.isArray(outcome.value))throw new ExpressionError('A facet expression must resolve to one value');
                faces.push({value:outcome.value,p:outcome.p/faceCount,explosion:facet.explosion});
              }
              continue;
            }
            let textPmf=only('');
            for(const segment of facet.segments){
              if(segment.kind==='text'){const next:PMF=new Map();for(const item of textPmf.values())put(next,String(item.value)+segment.text,item.p);textPmf=next;}
              else textPmf=combine(textPmf,visit(segment.expression,'scalar'),(a,b)=>{if(Array.isArray(b))throw new ExpressionError('A text facet expression must resolve to one value');return String(a)+String(b);});
            }
            for(const item of textPmf.values())faces.push({value:String(item.value).trim(),p:item.p/faceCount,explosion:facet.explosion});
          }
          if(faces.some(face=>face.explosion&&face.explosion.limit===undefined))throw new Error('unbounded exploding distribution');
          const one:PMF=new Map();
          for(const face of faces){
            if(!face.explosion){put(one,face.value,face.p);continue;}
            let frontier=[{total:scalar(face.value),p:face.p}];
            for(let depth=1;depth<=face.explosion.limit!;depth++){
              if(frontier.length*faces.length>MAX_STATES*8)throw new Error('state limit');
              const next:typeof frontier=[];
              for(const state of frontier)for(const extra of faces){
                const total=state.total+scalar(extra.value),p=state.p*extra.p;
                if(extra.explosion&&depth<face.explosion.limit!)next.push({total,p});
                else put(one,total,p);
              }
              if(next.length>MAX_STATES)throw new Error('state limit');
              frontier=next;if(!frontier.length)break;
            }
          }
          let rolls=only([]);
          for(let i=0;i<n;i++)rolls=combine(rolls,one,(a,b)=>[...members(a),b as Facet]);
          const resolution=plan.modeFor(node);
          for(const item of rolls.values()){
            const values=members(item.value);let value:Value;
            if(resolution==='pool')value=values;
            else if(values.every(x=>typeof x==='number'))value=values.reduce<number>((a,b)=>a+(b as number),0);
            else if(node.resolution==='sum')throw new ExpressionError('Symbolic dice cannot be summed');
            else value=values.length===1?values[0]:values;
            put(result,value,item.p*count.p*side.p);
          }
        }break;
      }
      case 'pool':{
        result=only([]);for(const child of node.items)result=combine(result,visit(child,'pool-source'),(a,b)=>[...members(a),...members(b)]);break;
      }
      case 'resolve':{
        const inner=visit(node.value,'pool-source');if(node.resolution==='pool'){result=inner;break;}
        result=new Map();for(const item of inner.values())put(result,members(item.value).reduce<number>((a,b)=>a+scalar(b),0),item.p);break;
      }
      case 'selector':{
        result=new Map();const count=visit(node.count,'scalar'),pool=visit(node.source,'pool-source'),rankMap=ranks(node.source);
        for(const c of count.values())for(const item of pool.values()){
          const n=scalar(c.value),values=members(item.value);
          if(!Number.isInteger(n)||n<1||n>values.length)throw new ExpressionError(`Cannot select or drop ${n} results from a pool of ${values.length}`);
          const rank=(v:Facet)=>typeof v==='number'?v:rankMap.get(v);
          if(values.some(v=>rank(v)===undefined))throw new ExpressionError('Cannot rank these symbolic facets');
          const sorted=values.map((value,index)=>({value,index})).sort((a,b)=>rank(a.value)!-rank(b.value)!);
          const selected=node.operator==='highest'?sorted.slice(-n):node.operator==='lowest'?sorted.slice(0,n):node.operator==='drop-highest'?sorted.slice(0,sorted.length-n):sorted.slice(n);
          const kept=selected.sort((a,b)=>a.index-b.index).map(x=>x.value);
          const value:Value=kept.every(v=>typeof v==='number')?kept.reduce<number>((a,b)=>a+(b as number),0):kept.length===1?kept[0]:kept;
          put(result,value,c.p*item.p);
        }break;
      }
    }
    let contexts=cache.get(node);if(!contexts){contexts=new Map();cache.set(node,contexts);}contexts.set(context,result);return result;
  };
  return visit(root,'scalar');
}
export function distribution(node:Node):Distribution{
  let pmf:PMF;let isExact=true;
  try{pmf=exact(node);}catch(error){
    if(error instanceof ExpressionError)throw error;
    isExact=false;pmf=new Map();const rng={integer:(n:number)=>Math.floor(Math.random()*n)};
    for(let i=0;i<ESTIMATE_TRIALS;i++)put(pmf,roll(node,rng).value,1/ESTIMATE_TRIALS);
  }
  const entries=[...pmf.values()].map(x=>({value:x.value,probability:x.p})).sort((a,b)=>typeof a.value==='number'&&typeof b.value==='number'?a.value-b.value:String(a.value).localeCompare(String(b.value)));
  const numeric=entries.every(x=>typeof x.value==='number');
  const mean=numeric?entries.reduce((a,b)=>a+(b.value as number)*b.probability,0):undefined;
  const mode=entries.reduce((a,b)=>b.probability>a.probability?b:a,entries[0])?.value;
  const range=numeric&&entries.length?[entries[0].value as number,entries.at(-1)!.value as number] as [number,number]:undefined;
  return {entries,exact:isExact,trials:isExact?undefined:ESTIMATE_TRIALS,mean,mode,range};
}
