import type { Diagnostic, FacetSpec, Node, Selector } from './ast';

type ValueType='numeric'|'symbolic'|'mixed';
const literal=(node:Node):number|undefined=>node.kind==='literal'?node.value:node.kind==='group'?literal(node.value):undefined;
const facetType=(facets:FacetSpec[]):ValueType=>{
  const types=new Set(facets.map(f=>f.kind==='value'?(typeof f.value==='number'?'numeric':'symbolic'):f.kind==='template'?'symbolic':typeOf(f.expression)));
  return types.size===1?[...types][0]:'mixed';
};
const explicitPool=(node:Node):boolean=>node.kind==='group'?explicitPool(node.value):node.kind==='dice'?node.resolution==='pool':node.kind==='pool'||(node.kind==='resolve'&&node.resolution==='pool');
function typeOf(node:Node):ValueType {
  switch(node.kind){
    case 'literal':case 'binary':case 'unary':return 'numeric';
    case 'group':return typeOf(node.value);
    case 'dice':return node.die.kind==='standard-die'?'numeric':facetType(node.die.facets);
    case 'pool': {const types=new Set(node.items.map(typeOf));return types.size===1?[...types][0]:'mixed';}
    case 'resolve':return node.resolution==='sum'?'numeric':typeOf(node.value);
    case 'selector':return typeOf(node.source);
    case 'interpret':return typeOf(node.expression);
  }
}
function possibleNumbers(node:Node):number[]|undefined{
  if(node.kind==='literal')return [node.value];
  if(node.kind==='group')return possibleNumbers(node.value);
  if(node.kind==='unary'){const values=possibleNumbers(node.value);return values?.map(v=>-v);}
  if(node.kind==='dice'&&literal(node.quantity)===1){
    if(node.die.kind==='custom-die'){
      const outcomes=node.die.facets.map(f=>f.kind==='value'&&typeof f.value==='number'?[f.value]:f.kind==='expression'?possibleNumbers(f.expression):undefined);
      if(outcomes.every(x=>x!==undefined)&&outcomes.reduce((n,x)=>n+(x?.length??0),0)<=1000)return [...new Set(outcomes.flatMap(x=>x??[]))];
    }
    if(node.die.kind==='standard-die'){const sides=literal(node.die.sides);if(sides!==undefined&&Number.isInteger(sides)&&sides>0&&sides<=1000)return Array.from({length:sides},(_,i)=>i+1);}
  }
  if(node.kind==='binary'){
    const a=possibleNumbers(node.left),b=possibleNumbers(node.right);if(!a||!b||a.length*b.length>1000)return undefined;
    return [...new Set(a.flatMap(x=>b.map(y=>node.op==='+'?x+y:node.op==='-'?x-y:node.op==='*'?x*y:x/y)))];
  }
  return undefined;
}
function knownPoolSize(node:Node):number|undefined{
  if(node.kind==='group')return knownPoolSize(node.value);
  if(node.kind==='dice')return node.resolution==='sum'?1:literal(node.quantity);
  if(node.kind==='pool'){const sizes=node.items.map(knownPoolSize);return sizes.every(x=>x!==undefined)?sizes.reduce<number>((a,b)=>a+(b??0),0):undefined;}
  if(node.kind==='resolve')return node.resolution==='sum'?1:knownPoolSize(node.value);
  return 1;
}
function symbolicOrders(node:Node):string[][]{
  if(node.kind==='dice'&&node.die.kind==='custom-die'&&facetType(node.die.facets)==='symbolic')return [[...new Set(node.die.facets.filter(f=>f.kind==='value'&&typeof f.value==='string').map(f=>(f as Extract<FacetSpec,{kind:'value'}>).value as string))]];
  if(node.kind==='group'||node.kind==='unary')return symbolicOrders(node.value);
  if(node.kind==='resolve')return symbolicOrders(node.value);
  if(node.kind==='pool')return node.items.flatMap(symbolicOrders);
  if(node.kind==='selector')return symbolicOrders(node.source);
  return [];
}
function hasDynamicSymbol(node:Node):boolean{
  if(node.kind==='dice'&&node.die.kind==='custom-die')return node.die.facets.some(f=>f.kind!=='value'&&((f.kind==='template')||typeOf(f.expression)!=='numeric'));
  if(node.kind==='group'||node.kind==='resolve')return hasDynamicSymbol(node.value);
  if(node.kind==='pool')return node.items.some(hasDynamicSymbol);
  if(node.kind==='selector')return hasDynamicSymbol(node.source);
  return false;
}
const acceptsCount=(operator:Selector,count:number,size:number)=>count<=size&&(operator==='highest'||operator==='lowest'||operator==='drop-highest'||operator==='drop-lowest');
export function validate(root:Node):Diagnostic[]{
  const diagnostics:Diagnostic[]=[];
  const issue=(node:Node,code:string,message:string)=>diagnostics.push({severity:'error',code,message,...node.span});
  const check=(node:Node):void=>{
    switch(node.kind){
      case 'literal':break;
      case 'interpret':check(node.expression);if(typeOf(node.expression)!=='numeric'||explicitPool(node.expression))issue(node.expression,'NONNUMERIC_INTERPRETATION','Interpretation requires one numeric result');break;
      case 'group':case 'unary':check(node.value);if(node.kind==='unary'){if(typeOf(node.value)!=='numeric')issue(node,'SYMBOLIC_ARITHMETIC','Symbolic values cannot be used in arithmetic');if(explicitPool(node.value))issue(node,'POOL_ARITHMETIC','Explicit pools require sum before arithmetic');}break;
      case 'binary':check(node.left);check(node.right);if(typeOf(node.left)!=='numeric'||typeOf(node.right)!=='numeric')issue(node,'SYMBOLIC_ARITHMETIC','Symbolic values cannot be used in arithmetic');if(explicitPool(node.left)||explicitPool(node.right))issue(node,'POOL_ARITHMETIC','Explicit pools require sum before arithmetic');break;
      case 'dice':{
        check(node.quantity);if(node.die.kind==='standard-die')check(node.die.sides);
        if(node.die.kind==='custom-die')for(const facet of node.die.facets){
          if(facet.kind==='expression'){check(facet.expression);if(explicitPool(facet.expression))issue(facet.expression,'FACET_POOL','A facet expression must resolve to one value');}
          if(facet.kind==='template')for(const segment of facet.segments)if(segment.kind==='expression'){check(segment.expression);if(explicitPool(segment.expression))issue(segment.expression,'FACET_POOL','A text facet expression must resolve to one value');}
        }
        if(node.die.kind==='custom-die'&&node.die.facets.length===0)issue(node,'EMPTY_DIE','A die must have at least one facet');
        if(typeOf(node.quantity)!=='numeric')issue(node,'INVALID_QUANTITY','Dice quantity must be numeric');
        if(explicitPool(node.quantity))issue(node.quantity,'INVALID_QUANTITY','Dice quantity must resolve to one scalar');
        const counts=possibleNumbers(node.quantity);
        if(counts?.some(n=>!Number.isInteger(n)||n<1||n>100))issue(node.quantity,'INVALID_QUANTITY','Dice quantity must resolve to an integer from 1 to 100');
        if(node.die.kind==='standard-die'){
          if(typeOf(node.die.sides)!=='numeric')issue(node.die.sides,'INVALID_SIDES','Die size must be numeric');
          if(explicitPool(node.die.sides))issue(node.die.sides,'INVALID_SIDES','Die size must resolve to one scalar');
          const sides=possibleNumbers(node.die.sides);
          if(sides?.some(n=>!Number.isInteger(n)||n<1||n>1000))issue(node.die.sides,'INVALID_SIDES','Die size must resolve to an integer from 1 to 1000');
        }
        if(node.resolution==='sum'&&typeOf(node)!=='numeric')issue(node,'SYMBOLIC_SUM','Symbolic dice cannot be summed');
        const explosions=node.die.kind==='standard-die'?[node.die.explodeHighest]:node.die.facets.map(f=>f.explosion);
        for(const explosion of explosions)if(explosion?.limit!==undefined&&(!Number.isInteger(explosion.limit)||explosion.limit<1||explosion.limit>100))issue(node,'INVALID_EXPLOSION_LIMIT','Explosion limit must be an integer from 1 to 100');
        if(node.die.kind==='standard-die'&&node.die.explodeHighest?.limit===undefined&&node.die.explodeHighest&&possibleNumbers(node.die.sides)?.includes(1))issue(node,'NO_TERMINATION','An unlimited exploding d1 cannot terminate');
        if(node.die.kind==='custom-die'){
          for(const facet of node.die.facets)if(facet.explosion&&(facet.kind==='template'||(facet.kind==='value'&&typeof facet.value!=='number')||(facet.kind==='expression'&&typeOf(facet.expression)!=='numeric')))issue(node,'SYMBOLIC_EXPLOSION','Only numerical facets can explode');
          if(node.die.facets.every(f=>f.explosion)&&node.die.facets.some(f=>f.explosion?.limit===undefined))issue(node,'NO_TERMINATION','An unlimited die whose every facet explodes cannot terminate');
        }
        if(node.reroll&&typeOf(node)!=='numeric')issue(node,'SYMBOLIC_REROLL','Rerolls require numeric facets');
        break;
      }
      case 'pool':node.items.forEach(check);break;
      case 'resolve':check(node.value);if(node.resolution==='sum'&&typeOf(node.value)!=='numeric')issue(node,'SYMBOLIC_SUM','Symbolic outcomes cannot be summed');break;
      case 'selector':{
        check(node.count);check(node.source);
        if(typeOf(node.count)!=='numeric')issue(node.count,'INVALID_SELECTOR_COUNT','Selection count must be numeric');
        if(explicitPool(node.count))issue(node.count,'INVALID_SELECTOR_COUNT','Selection count must resolve to one scalar');
        const counts=possibleNumbers(node.count),size=knownPoolSize(node.source);
        if(counts?.some(n=>!Number.isInteger(n)||n<1))issue(node.count,'INVALID_SELECTOR_COUNT','Selection count must be a positive integer');
        if(size!==undefined&&counts?.some(n=>!acceptsCount(node.operator,n,size)))issue(node,'SELECTOR_EXCEEDS_POOL',`Cannot select or drop more than ${size} pool result${size===1?'':'s'}`);
        if(typeOf(node.source)==='mixed')issue(node,'MIXED_POOL','Cannot rank mixed numeric and symbolic results');
        if(hasDynamicSymbol(node.source))issue(node,'UNRANKABLE_SYMBOLIC_FACET','Text facets with evaluated expressions have no fixed symbolic rank');
        const orders=symbolicOrders(node.source);if(orders.length>1&&orders.some(order=>JSON.stringify(order)!==JSON.stringify(orders[0])))issue(node,'INCOMPATIBLE_SYMBOLIC_RANK','Symbolic dice in a pool must share the same facet ranking');
        break;
      }
    }
  };
  check(root);return diagnostics;
}
