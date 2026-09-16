import type { Facet, Node, Selector } from './ast';
export type FormatStyle='short'|'longReadable'|'longExpanded';
const selectorShort:Record<Selector,string>={highest:'H',lowest:'L','drop-highest':'DH','drop-lowest':'DL'};
const selectorLong:Record<Selector,string>={highest:'highest',lowest:'lowest','drop-highest':'drop highest','drop-lowest':'drop lowest'};
const facet=(value:Facet)=>String(value);
function conventional(facets:Facet[]):number|undefined{
  if(!facets.length||!facets.every(x=>typeof x==='number'&&Number.isInteger(x)&&x>0))return undefined;
  const sorted=[...(facets as number[])].sort((a,b)=>a-b);
  return sorted.every((value,index)=>value===index+1)?sorted.length:undefined;
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
        const sides=node.die.sides.kind==='group'?`(${format(node.die.sides.value,style)})`:format(node.die.sides,style,4);
        const fixed=node.die.sides.kind==='literal'?node.die.sides.value:undefined;
        die=style==='longExpanded'&&fixed!==undefined&&Number.isInteger(fixed)&&fixed>0&&fixed<=1000?`die{${Array.from({length:fixed},(_,i)=>i+1).join(',')}}`:`d${sides}`;
      }else{
        const fixed=conventional(node.die.facets);
        die=style!=='longExpanded'&&fixed?`d${fixed}`:`${style==='short'?'d':'die'}{${node.die.facets.map(facet).join(',')}}`;
      }
      const prefix=node.resolution==='inferred'?'':style==='short'?(node.resolution==='pool'?'p':'s'):`${node.resolution} `;
      const separator=style==='short'?'':quantity?' ':'';
      const reroll=node.reroll?`${node.reroll.once?'ro':'r'}${node.reroll.comparator}${node.reroll.target}`:'';
      output=`${prefix}${quantity}${separator}${die}${reroll}${node.explode?'!':''}`;break;
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
  }
  return precedence(node)<parent?`(${output})`:output;
}
export const formatShort=(node:Node)=>format(node,'short');
export const formatLongReadable=(node:Node)=>format(node,'longReadable');
export const formatLongExpanded=(node:Node)=>format(node,'longExpanded');
