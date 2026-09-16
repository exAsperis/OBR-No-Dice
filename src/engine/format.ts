import type { Explosion, FacetSpec, Node, Selector } from './ast';
import { formatInterpretationCondition } from './interpretation';
export type FormatStyle='short'|'longReadable'|'longExpanded';
const selectorShort:Record<Selector,string>={highest:'H',lowest:'L','drop-highest':'DH','drop-lowest':'DL'};
const selectorLong:Record<Selector,string>={highest:'highest',lowest:'lowest','drop-highest':'drop highest','drop-lowest':'drop lowest'};
function constant(node:Node):number|undefined{
  if(node.kind==='literal')return node.value;
  if(node.kind==='group')return constant(node.value);
  if(node.kind==='unary'){const value=constant(node.value);return value===undefined?undefined:-value;}
  if(node.kind==='binary'){const a=constant(node.left),b=constant(node.right);if(a===undefined||b===undefined)return undefined;const value=node.op==='+'?a+b:node.op==='-'?a-b:node.op==='*'?a*b:a/b;return Number.isFinite(value)?value:undefined;}
  return undefined;
}
function facetNumber(facet:FacetSpec):number|undefined{return facet.kind==='value'&&typeof facet.value==='number'?facet.value:facet.kind==='expression'?constant(facet.expression):undefined;}
const explosionText=(explosion?:Explosion)=>explosion?`!${explosion.limit??''}`:'';
const rerollText=(reroll?:Explosion)=>reroll?`r${reroll.limit??''}`:'';
function conventional(facets:FacetSpec[]):{sides:number;explosion?:Explosion;reroll?:Explosion}|undefined{
  if(!facets.length||!facets.every(x=>x.kind==='value'&&typeof x.value==='number'&&Number.isInteger(x.value)&&x.value>0))return undefined;
  const sorted=facets.map(x=>facetNumber(x)!).sort((a,b)=>a-b);
  if(!sorted.every((value,index)=>value===index+1))return undefined;
  if(facets.some(x=>x.explosion&&facetNumber(x)!==sorted.length))return undefined;
  if(facets.some(x=>x.facetReroll&&facetNumber(x)!==1))return undefined;
  return {sides:sorted.length,explosion:facets.find(x=>facetNumber(x)===sorted.length)?.explosion,reroll:facets.find(x=>facetNumber(x)===1)?.facetReroll};
}
function compactRange(facets:FacetSpec[]):string|undefined{
  if(facets.length<2||!facets.every(f=>f.kind==='value'&&typeof f.value==='number'&&Number.isInteger(f.value)&&!f.explosion&&!f.facetReroll))return undefined;
  const values=facets.map(f=>(f as Extract<FacetSpec,{kind:'value'}>).value as number);
  if(!values.every((value,index)=>value===values[0]+index))return undefined;
  const range=`${values[0]}..${values.at(-1)}`;
  return range.length<values.join(',').length?range:undefined;
}
function facetText(facet:FacetSpec,style:FormatStyle):string{
  let value:string;
  if(facet.kind==='value')value=String(facet.value);
  else if(facet.kind==='expression'){const fixed=constant(facet.expression);value=fixed===undefined?format(facet.expression,style):String(fixed);}
  else value=facet.segments.map(segment=>segment.kind==='text'?segment.text:format(segment.expression,style)).join('').trim();
  return value+explosionText(facet.explosion)+rerollText(facet.facetReroll);
}
const precedence=(node:Node)=>node.kind==='binary'?(node.op==='+'||node.op==='-'?1:2):node.kind==='unary'?3:4;
function format(node:Node,style:FormatStyle,parent=0):string{
  if(node.kind==='group')return format(node.value,style,parent);
  let output:string;
  switch(node.kind){
    case 'literal':output=String(node.value);break;
    case 'unary':output=`-${format(node.value,style,3)}`;break;
    case 'binary':{const rank=precedence(node);output=`${format(node.left,style,rank)}${node.op}${format(node.right,style,rank+1)}`;break;}
    case 'dice':{
      const quantity=node.quantity.kind==='literal'&&node.quantity.value===1?'':node.quantity.kind==='group'?`(${format(node.quantity.value,style)})`:format(node.quantity,style,4);
      let die:string;
      if(node.die.kind==='standard-die'){
        const highestExplosion=node.die.explodeHighest;
        const sides=node.die.sides.kind==='group'?`(${format(node.die.sides.value,style)})`:format(node.die.sides,style,4);
        const fixed=node.die.sides.kind==='literal'?node.die.sides.value:undefined;
        die=style==='longExpanded'&&fixed!==undefined&&Number.isInteger(fixed)&&fixed>0&&fixed<=1000?`die{${Array.from({length:fixed},(_,i)=>`${i+1}${i===0?rerollText(node.die.kind==='standard-die'?node.die.rerollLowest:undefined):''}${i+1===fixed?explosionText(highestExplosion):''}`).join(',')}}`:`d${sides}${explosionText(highestExplosion)}${rerollText(node.die.rerollLowest)}`;
      }else{
        const fixed=conventional(node.die.facets);
        const range=style==='longExpanded'?undefined:compactRange(node.die.facets);
        die=style!=='longExpanded'&&fixed?`d${fixed.sides}${explosionText(fixed.explosion)}${rerollText(fixed.reroll)}`:`${style==='short'?'d':'die'}{${range??node.die.facets.map(face=>facetText(face,style)).join(',')}}`;
      }
      const prefix=node.resolution==='inferred'?'':style==='short'?(node.resolution==='pool'?'p':'s'):`${node.resolution} `;
      const separator=style==='short'?'':quantity?' ':'';
      const reroll=node.reroll?`${node.reroll.once?'ro':'r'}${node.reroll.comparator}${node.reroll.target}`:'';
      output=`${prefix}${quantity}${separator}${die}${reroll}`;break;
    }
    case 'pool':output=`pool(${node.items.map(item=>format(item,style)).join(',')})`;break;
    case 'resolve':{
      if(node.value.kind==='pool'){
        const name=style==='short'?(node.resolution==='pool'?'p':'s'):node.resolution;
        output=`${name}(${node.value.items.map(item=>format(item,style)).join(',')})`;
      }else output=`${style==='short'?(node.resolution==='pool'?'p':'s'):`${node.resolution} `}${format(node.value,style)}`;
      break;
    }
    case 'selector':{
      const count=node.count.kind==='literal'&&node.count.value===1?'':node.count.kind==='group'?`(${format(node.count.value,style)})`:format(node.count,style,4);
      const items=node.source.items.map(item=>format(item,style)).join(',');
      output=style==='short'?`${selectorShort[node.operator]}${count}[${items}]`:`${selectorLong[node.operator]} ${count||'1'} ${node.operator.startsWith('drop')?'from':'of'} [${items}]`;
      break;
    }
    case 'interpret':output=`${format(node.expression,style)} | ${node.rules.map(rule=>`${formatInterpretationCondition(rule.condition)}:${rule.label}`).join('; ')}`;break;
  }
  return precedence(node)<parent?`(${output})`:output;
}
export const formatShort=(node:Node)=>format(node,'short');
export const formatLongReadable=(node:Node)=>format(node,'longReadable');
export const formatLongExpanded=(node:Node)=>format(node,'longExpanded');
export const formatFacetShort=(facet:FacetSpec)=>facetText(facet,'short');
