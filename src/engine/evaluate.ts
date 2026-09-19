import { ExpressionError, type Explosion, type Facet, type Node } from './ast';
import { formatFacetShort, formatShort } from './format';
import { resolveSemantics, type SemanticPlan } from './semantics';
import { PresentationRecorder } from './presentation';
import { matchesInterpretation } from './interpretation';

export interface Rng { integer(maxExclusive:number):number }
export interface EvaluationOptions { dieOverride?: (context:{node:Extract<Node,{kind:'dice'}>;faceCount:number})=>number|undefined }
export const cryptoRng:Rng={integer(maxExclusive){
  if(!Number.isSafeInteger(maxExclusive)||maxExclusive<1||maxExclusive>0x100000000)throw new Error('Invalid random range');
  const limit=Math.floor(0x100000000/maxExclusive)*maxExclusive;
  const bytes=new Uint32Array(1);let value:number;
  do{crypto.getRandomValues(bytes);value=bytes[0];}while(value>=limit);
  return value%maxExclusive;
}};
export type Value=Facet|Facet[];
export interface DieDraw { die: string; dieIndex: number; face: Facet; kind: 'initial'|'reroll'|'explosion'; nodeSpan?:{start:number;end:number}; facetIndex?:number; exploded?:boolean }
export interface Evaluation {value:Value;trace:string[];stages:string[];stageDice?:string[];stageDrawIndices?:number[][];interpretation?:string;dice?:DieDraw[]}
type Context='scalar'|'pool-source';
/** One budget follows the entire roll, including dynamic parameters and nested facets. */
export const MAX_ROLL_STEPS=20000;
interface RollBudget { steps:number; depth:number; dice:DieDraw[]; options?:EvaluationOptions }
function spend(budget:RollBudget):void{
  if(++budget.steps>MAX_ROLL_STEPS)throw new ExpressionError(`Roll exceeded the ${MAX_ROLL_STEPS}-step safety limit. Check for a non-terminating explosion or reroll.`);
}
const show=(value:Value)=>Array.isArray(value)?`[${value.join(', ')}]`:String(value);
const number=(value:Value):number=>{if(typeof value!=='number'||!Number.isFinite(value))throw new ExpressionError('This operation requires a numeric scalar');return value;};
const members=(value:Value):Facet[]=>Array.isArray(value)?value:[value];
const positiveInteger=(value:Value,name:string,maximum:number)=>{const n=number(value);if(!Number.isInteger(n)||n<1||n>maximum)throw new ExpressionError(`${name} must resolve to an integer from 1 to ${maximum}`);return n;};
function rankMap(node:Node):Map<string,number>{
  if(node.kind==='dice'&&node.die.kind==='custom-die'){const ranks=new Map<string,number>();for(const facet of node.die.facets)if(facet.kind==='value'&&typeof facet.value==='string'&&!ranks.has(facet.value))ranks.set(facet.value,ranks.size);return ranks;}
  if(node.kind==='pool'){const map=new Map<string,number>();for(const child of node.items)for(const [value,rank] of rankMap(child))map.set(value,rank);return map;}
  if(node.kind==='group'||node.kind==='unary'||node.kind==='resolve')return rankMap(node.value);
  if(node.kind==='selector')return rankMap(node.source);
  return new Map();
}
function evaluateNode(node:Node,rng:Rng,context:Context,plan:SemanticPlan,presentation:PresentationRecorder,showStages:boolean,budget:RollBudget,operand=false):Evaluation{
  spend(budget);
  if(++budget.depth>100)throw new ExpressionError('Roll exceeded the nested expression safety limit');
  try{return evaluateNodeInner(node,rng,context,plan,presentation,showStages,budget,operand);}finally{budget.depth--;}
}
function evaluateNodeInner(node:Node,rng:Rng,context:Context,plan:SemanticPlan,presentation:PresentationRecorder,showStages:boolean,budget:RollBudget,operand:boolean):Evaluation{
  switch(node.kind){
    case 'interpret':{
      const result=evaluateNode(node.expression,rng,'scalar',plan,presentation,showStages,budget);
      const value=number(result.value);
      const label=node.rules.find(rule=>matchesInterpretation(rule.condition,value))?.label;
      return {...result,interpretation:label};
    }
    case 'literal':return {value:node.value,trace:[],stages:presentation.stages};
    case 'group':return evaluateNode(node.value,rng,context,plan,presentation,showStages,budget,operand);
    case 'unary':{const inner=evaluateNode(node.value,rng,'scalar',plan,presentation,showStages,budget,operand);const value=-number(inner.value);presentation.replace(node,String(value));if(showStages&&!presentation.isRoot(node))presentation.show();return {value,trace:[...inner.trace,`−${show(inner.value)} → ${value}`],stages:presentation.stages};}
    case 'binary':{
      const left=evaluateNode(node.left,rng,'scalar',plan,presentation,showStages,budget,operand),right=evaluateNode(node.right,rng,'scalar',plan,presentation,showStages,budget,operand);const a=number(left.value),b=number(right.value);
      const value=node.op==='+'?a+b:node.op==='-'?a-b:node.op==='*'?a*b:a/b;
      if(!Number.isFinite(value))throw new ExpressionError('Non-finite arithmetic result');
      presentation.replace(node,String(value));if(showStages&&!presentation.isRoot(node))presentation.show();
      return {value,trace:[...left.trace,...right.trace,`${a} ${node.op} ${b} → ${value}`],stages:presentation.stages};
    }
    case 'dice':{
      const firstDraw=budget.dice.length;
      // Resolve operands left to right before drawing the outer dice.
      const quantity=evaluateNode(node.quantity,rng,'scalar',plan,presentation,showStages,budget,true);const count=positiveInteger(quantity.value,'Dice quantity',100);
      const sides=node.die.kind==='standard-die'?evaluateNode(node.die.sides,rng,'scalar',plan,presentation,showStages,budget,true):undefined;
      const faceCount=node.die.kind==='custom-die'?node.die.facets.length:positiveInteger(sides!.value,'Die size',1000);
      if(!faceCount)throw new ExpressionError('A die must have at least one facet');
      const chooseIndex=()=>{const forced=budget.options?.dieOverride?.({node,faceCount});if(forced===undefined)return rng.integer(faceCount);if(!Number.isInteger(forced)||forced<0||forced>=faceCount)throw new ExpressionError('Override value is not a legal die face');return forced;};
      const results:Facet[]=[];const trace=[...quantity.trace,...(sides?.trace??[])];
      // Select all initial custom facets before evaluating their expressions.
      // This makes each facet's nested rolls visible in left-to-right order.
      const customFacets=node.die.kind==='custom-die'?node.die.facets:undefined;
      const selected=customFacets?Array.from({length:count},()=>{spend(budget);return chooseIndex();}):undefined;
      const selectedLabels=selected?.map(index=>formatFacetShort(customFacets![index]));
      if(selectedLabels&&showStages&&customFacets!.some(facet=>facet.kind!=='value')){presentation.replace(node,show(selectedLabels));presentation.show(formatShort(node));}
      const continuationDie=formatShort({...node,quantity:{kind:'literal',value:1,span:node.quantity.span}});
      const unitDie=formatShort({...node,quantity:{kind:'literal',value:1,span:node.quantity.span},die:node.die.kind==='standard-die'?{...node.die,explodeHighest:undefined}:{...node.die,facets:node.die.facets.map(facet=>({...facet,explosion:undefined}))}});
      const explodingTerm=node.die.kind==='standard-die'?Boolean(node.die.explodeHighest):node.die.facets.some(facet=>Boolean(facet.explosion));
      const progress=(current:string,completed:Facet[])=>count===1?current:`[${[...completed.map(String),current,...Array.from({length:count-completed.length-1},()=>continuationDie)].join(', ')}]`;
      const marked=(face:Facet,bang=false)=>count===1?`[${String(face)}${bang?'!':''}]`:`${String(face)}${bang?'!':''}`;
      let drawKind:DieDraw['kind']='initial', dieIndex=0;
      const draw=(preselected?:number):{value:Facet;explosion?:Explosion;facetReroll?:Explosion;index:number}=>{
        if(preselected===undefined)spend(budget);
        const index=preselected??chooseIndex();
        if(node.die.kind==='standard-die'){budget.dice.push({die:formatShort(node),dieIndex,face:index+1,kind:drawKind,nodeSpan:node.span,facetIndex:index});return {value:index+1,index,explosion:index+1===faceCount?node.die.explodeHighest:undefined,facetReroll:index===0?node.die.rerollLowest:undefined};}
        const facet=node.die.facets[index];
        if(facet.kind==='value'){budget.dice.push({die:formatShort(node),dieIndex,face:facet.value,kind:drawKind,nodeSpan:node.span,facetIndex:index});return {value:facet.value,index,explosion:facet.explosion,facetReroll:facet.facetReroll};}
        trace.push(`facet ${index+1}/${faceCount} → ${formatFacetShort(facet)}`);
        if(facet.kind==='expression'){
          const result=evaluateNode(facet.expression,rng,'scalar',plan,presentation,false,budget);trace.push(...result.trace);
          if(Array.isArray(result.value))throw new ExpressionError('A facet expression must resolve to one value');
          trace.push(`facet result → ${result.value}`);budget.dice.push({die:formatShort(node),dieIndex,face:result.value,kind:drawKind,nodeSpan:node.span,facetIndex:index});return {value:result.value,index,explosion:facet.explosion,facetReroll:facet.facetReroll};
        }
        const rendered=facet.segments.map(segment=>{
          if(segment.kind==='text')return segment.text;
          const result=evaluateNode(segment.expression,rng,'scalar',plan,presentation,false,budget);trace.push(...result.trace);
          if(Array.isArray(result.value))throw new ExpressionError('A text facet expression must resolve to one value');
          return String(result.value);
        }).join('').trim();
        trace.push(`facet result → ${rendered}`);budget.dice.push({die:formatShort(node),dieIndex,face:rendered,kind:drawKind,nodeSpan:node.span,facetIndex:index});return {value:rendered,index,explosion:facet.explosion,facetReroll:facet.facetReroll};
      };
      for(let i=0;i<count;i++){
        const firstDieDraw=budget.dice.length;
        dieIndex=i;drawKind='initial';
        let drawn=draw(selected?.[i]),face=drawn.value;trace.push(`die ${i+1} → ${face}`);
        if(node.reroll){
          const {once,comparator,target}=node.reroll;
          const matches=(v:Facet)=>{const x=number(v);return comparator==='='?x===target:comparator==='<'?x<target:comparator==='<='?x<=target:comparator==='>'?x>target:x>=target;};
          let tries=0;while(matches(face)){if(++tries>100)throw new ExpressionError('Reroll limit reached');drawKind='reroll';drawn=draw();face=drawn.value;trace.push(`reroll → ${face}`);if(once)break;}
        }
        const settleFacetRerolls=()=>{
          const rerollCounts=new Map<number,number>();let rerolls=0;
          while(drawn.facetReroll){
            const used=rerollCounts.get(drawn.index)??0,limit=drawn.facetReroll.limit;
            if(limit!==undefined&&used>=limit)break;
            if(++rerolls>100)throw new ExpressionError('Reroll safety limit reached');
            rerollCounts.set(drawn.index,used+1);drawKind='reroll';drawn=draw();face=drawn.value;trace.push(`reroll → ${face}`);
          }
        };
        settleFacetRerolls();
        let value:Facet=face;
        if(drawn.explosion){
          const limit=drawn.explosion.limit??100,unbounded=drawn.explosion.limit===undefined;
          let extra=0;const chain:Facet[]=[];
          while(drawn.explosion&&extra<limit){
            const triggerIndex=budget.dice.length-1;budget.dice[triggerIndex].exploded=true;
            chain.push(face);
            if(showStages){const terms=[...chain.slice(0,-1).map(String),marked(face,true)];presentation.replace(node,progress(terms.join(' + '),results));presentation.show(unitDie,[triggerIndex]);presentation.replace(node,progress(`${chain.map(String).join(' + ')} + ${continuationDie}`,results));presentation.show();}
            extra++;drawKind='explosion';drawn=draw();face=drawn.value;trace.push(`explode → ${face}`);settleFacetRerolls();value=number(value)+number(face);
          }
          if(unbounded&&extra===100&&drawn.explosion)throw new ExpressionError('Explosion safety limit reached');
          const finalIndex=budget.dice.length-1;
          if(showStages){const terms=[...chain.map(String),marked(face)];presentation.replace(node,progress(terms.join(' + '),results));presentation.show(unitDie,[finalIndex]);presentation.replace(node,progress([...chain.map(String),String(face)].join(' + '),results));presentation.show();}
          trace.push(`die ${i+1} total → ${value}`);
        } else if(explodingTerm&&showStages){
          const drawIndex=budget.dice.length-1;
          presentation.replace(node,progress(marked(face),results));presentation.show(unitDie,[drawIndex]);
          presentation.replace(node,progress(String(face),results));presentation.show();
        }
        results.push(value);
        if(selectedLabels&&showStages&&!explodingTerm){selectedLabels[i]=String(value);presentation.replace(node,show(selectedLabels));if(!budget.dice.slice(firstDieDraw).some(draw=>draw.kind==='explosion'))presentation.show(customFacets![selected![i]].kind==='expression'?formatFacetShort(customFacets![selected![i]]):'');}
      }
      trace.push(`${formatShort(node)} → ${show(results)}`);
      const resolution=plan.modeFor(node);
      presentation.replace(node,show(results));if(showStages&&!operand&&!explodingTerm)presentation.show(formatShort(node),Array.from({length:budget.dice.length-firstDraw},(_,i)=>firstDraw+i));
      if(resolution==='pool')return {value:results,trace,stages:presentation.stages};
      if(results.every(v=>typeof v==='number')){const value=results.reduce<number>((a,b)=>a+(b as number),0);presentation.replace(node,String(value));if(showStages)presentation.show(operand?formatShort(node):'');return {value,trace:[...trace,`sum → ${value}`],stages:presentation.stages};}
      if(node.resolution==='sum')throw new ExpressionError('Symbolic dice cannot be summed');
      if(results.length===1){presentation.replace(node,String(results[0]));return {value:results[0],trace,stages:presentation.stages};}
      return {value:results,trace,stages:presentation.stages};
    }
    case 'pool':{
      const evaluated=node.items.map(item=>evaluateNode(item,rng,'pool-source',plan,presentation,showStages,budget));
      const value=evaluated.flatMap(e=>members(e.value));
      presentation.replace(node,show(value));if(showStages)presentation.show();
      return {value,trace:[...evaluated.flatMap(e=>e.trace),`pool → ${show(value)}`],stages:presentation.stages};
    }
    case 'resolve':{
      const inner=evaluateNode(node.value,rng,'pool-source',plan,presentation,showStages,budget);
      if(node.resolution==='pool')return inner;
      const value=members(inner.value).reduce<number>((a,b)=>a+number(b),0);
      presentation.replace(node,String(value));if(showStages&&!presentation.isRoot(node))presentation.show();
      return {value,trace:[...inner.trace,`sum → ${value}`],stages:presentation.stages};
    }
    case 'selector':{
      const countResult=evaluateNode(node.count,rng,'scalar',plan,presentation,showStages,budget,true);const count=positiveInteger(countResult.value,'Selection count',100);
      const firstSourceDraw=budget.dice.length;
      const source=evaluateNode(node.source,rng,'pool-source',plan,presentation,false,budget);const values=members(source.value);
      if(count>values.length)throw new ExpressionError(`Cannot select or drop ${count} results from a pool of ${values.length}`);
      const ranks=rankMap(node.source);
      const rank=(v:Facet)=>typeof v==='number'?v:ranks.get(v);
      if(values.some(v=>rank(v)===undefined))throw new ExpressionError('Symbolic pool results do not share a rank');
      const sorted=values.map((value,index)=>({value,index})).sort((a,b)=>rank(a.value)!-rank(b.value)!);
      const selected=node.operator==='highest'?sorted.slice(-count):node.operator==='lowest'?sorted.slice(0,count):node.operator==='drop-highest'?sorted.slice(0,sorted.length-count):sorted.slice(count);
      const kept=selected.sort((a,b)=>a.index-b.index).map(x=>x.value);
      const trace=[...countResult.trace,...source.trace,`${formatShort(node)} → ${show(kept)}`];
      presentation.replace(node.count,String(count));presentation.replace(node.source,values.map(String).join(','));if(showStages){
        const indices=Array.from({length:budget.dice.length-firstSourceDraw},(_,index)=>firstSourceDraw+index);
        const die=indices.length&&indices.every(index=>budget.dice[index].die===budget.dice[indices[0]].die)?budget.dice[indices[0]].die:'';
        presentation.show(die,indices);
      }
      presentation.replace(node,show(kept));if(showStages)presentation.show();
      if(kept.every(v=>typeof v==='number')){const value=kept.reduce<number>((a,b)=>a+(b as number),0);presentation.replace(node,String(value));if(showStages&&!presentation.isRoot(node))presentation.show();return {value,trace:[...trace,`sum → ${value}`],stages:presentation.stages};}
      return {value:kept.length===1?kept[0]:kept,trace,stages:presentation.stages};
    }
  }
}
export function evaluate(node:Node,rng:Rng=cryptoRng,recordStages=true,options?:EvaluationOptions):Evaluation{const presentation=new PresentationRecorder(node,recordStages);const budget:RollBudget={steps:0,depth:0,dice:[],options};const result=evaluateNode(node,rng,'scalar',resolveSemantics(node),presentation,recordStages,budget);return {...result,stageDice:presentation.stageDice,stageDrawIndices:presentation.stageDrawIndices,dice:budget.dice};}
export const roll=evaluate;
