import { ExpressionError, type Comparator, type Diagnostic, type Dialect, type Explosion, type FacetSpec, type Node, type ResolutionMode, type Selector, type Span } from './ast';
import { tokenize, type Token } from './tokenizer';
import { validate } from './validate';
import { parseInterpretationTable } from './interpretation';
import { splitExpressionName } from '../expressionName';

const span=(a:Span|Node,b:Span|Node):Span=>({start:'span'in a?a.span.start:a.start,end:'span'in b?b.span.end:b.end});
const lit=(value:number,where:Span):Extract<Node,{kind:'literal'}>=>({kind:'literal',value,span:where});
const word=(token:Token,value:string)=>token.kind==='word'&&token.text.toLowerCase()===value;

class Parser {
  private index=0;
  constructor(private tokens:Token[],private dialect:Dialect,private source:string){}
  private at(offset=0){return this.tokens[Math.min(this.index+offset,this.tokens.length-1)];}
  private next(){return this.tokens[this.index++];}
  private is(value:string){return this.at().text.toLowerCase()===value.toLowerCase();}
  private take(value:string){if(this.is(value)){return this.next();}return undefined;}
  private error(message:string,code='SYNTAX'):never {const t=this.at();const diagnostic:Diagnostic={severity:'error',code,message,start:t.start,end:t.end};throw new ExpressionError(`${message} at position ${t.start+1}`,t.kind==='eof',diagnostic);}
  private expect(value:string){return this.take(value)??this.error(`Expected '${value}'`);}
  private number(){const t=this.at();if(t.kind!=='number')this.error('Expected a number');this.next();return lit(Number(t.text),t);}
  parse():Node{const result=this.additive();if(this.at().kind!=='eof')this.error(`Unexpected '${this.at().text}'`);return result;}
  private additive():Node{let node=this.multiplicative();while(this.is('+')||this.is('-')){const op=this.next().text as '+'|'-';const right=this.multiplicative();node={kind:'binary',op,left:node,right,span:span(node,right)};}return node;}
  private multiplicative():Node{let node=this.unary();while(this.is('*')||this.is('/')){const op=this.next().text as '*'|'/';const right=this.unary();node={kind:'binary',op,left:node,right,span:span(node,right)};}return node;}
  private unary():Node{const minus=this.take('-');if(minus){const value=this.unary();return {kind:'unary',op:'-',value,span:span(minus,value)};}this.take('+');return this.primary();}
  private primary():Node{
    const t=this.at();
    if(this.dialect==='nodice'){
      const selector=this.selectorName();if(selector)return this.selector(selector);
      if(['p','pool','s','sum'].some(x=>word(t,x)))return this.resolved();
    }
    if(t.kind==='number'){
      const n=this.number();if(this.is('d')||this.is('die'))return this.dice(n,'inferred');return n;
    }
    if(this.is('d')||this.is('die'))return this.dice(lit(1,t),'inferred');
    if(this.is('(')){
      const group=this.group();if(this.is('d')||this.is('die'))return this.dice(group,'inferred');return group;
    }
    this.error('Expected a number, die, selector, or group');
  }
  private group():Node{const open=this.expect('(');const value=this.additive();const close=this.expect(')');return {kind:'group',value,span:span(open,close)};}
  private resolved():Node{
    const prefix=this.next();const resolution:ResolutionMode=['p','pool'].includes(prefix.text.toLowerCase())?'pool':'sum';
    if(this.is('(')){
      // A parenthesized quantity is followed immediately by a die. Otherwise this is the legacy pool()/sum() function.
      let depth=0,end=this.index;for(;end<this.tokens.length;end++){if(this.tokens[end].text==='(')depth++;else if(this.tokens[end].text===')'&&--depth===0)break;}
      if(this.tokens[end+1]&&['d','die'].includes(this.tokens[end+1].text.toLowerCase()))return this.dice(this.group(),resolution,prefix);
      const open=this.expect('(');const items:Node[]=[];
      if(!this.is(')')){items.push(this.additive());while(this.take(','))items.push(this.additive());}
      const close=this.expect(')');const source:Node={kind:'pool',items,span:span(open,close)};
      return {kind:'resolve',resolution,value:source,span:span(prefix,close)};
    }
    let quantity:Node|undefined;
    if(this.at().kind==='number')quantity=this.number();
    if(!this.is('d')&&!this.is('die'))this.error(`Expected a die after '${prefix.text}'`);
    return this.dice(quantity??lit(1,this.at()),resolution,prefix);
  }
  private dice(quantity:Node,resolution:ResolutionMode,start?:Span):Node{
    const marker=this.next();let die:Extract<Node,{kind:'dice'}>['die'];let end:Span;
    if(this.take('{')){
      const facets:FacetSpec[]=[];
      if(this.is('}'))this.error('A die must have at least one facet','EMPTY_DIE');
      do{
        const range=this.rangeFacets();
        facets.push(...(range??[this.facet()]));
        if(facets.length>1000)this.error('A die may contain at most 1,000 facets','FACET_LIMIT');
      }while(this.take(','));
      end=this.expect('}');die={kind:'custom-die',facets};
    }else if(this.is('(')){
      const sides=this.group();die={kind:'standard-die',sides};end=sides.span;
    }else if(this.at().kind==='number'){
      const sides=this.number();die={kind:'standard-die',sides};end=sides.span;
    }else this.error(`Expected die facets or size after '${marker.text}'`);
    if(marker.text.toLowerCase()==='die'&&die.kind==='standard-die')this.error("Long 'die' requires a facet list");
    let result:Node={kind:'dice',quantity,die,resolution,span:span(start??(quantity.span.start===marker.start?marker:quantity),end)};
    {
      while(true){
        const mod=this.at().text.toLowerCase();
        if(this.dialect==='roll20'&&['kh','kl','dh','dl'].includes(mod)){
          const op=this.next();const count=this.number();const source:Node={kind:'pool',items:[result],span:result.span};
          result={kind:'selector',operator:({kh:'highest',kl:'lowest',dh:'drop-highest',dl:'drop-lowest'} as Record<string,Selector>)[mod],count,source:source as Extract<Node,{kind:'pool'}>,span:span(result,count)};continue;
        }
        if(['r','ro'].includes(mod)&&!(this.dialect==='nodice'&&mod==='r'&&!['<','<=','=','>','>='].includes(this.at(1).text))){
          if(result.kind!=='dice')this.error('Reroll must precede keep/drop modifiers');
          const r=this.next();let comparator:Comparator='=';
          if(['<','<=','=','>','>='].includes(this.at().text))comparator=this.next().text as Comparator;
          const sign=this.take('-');const target=this.number();result.reroll={once:mod==='ro',comparator,target:(sign?-1:1)*target.value};result.span.end=target.span.end;void r;continue;
        }
        const explosion=this.explosion();
        if(explosion){
          if(result.kind!=='dice')this.error('Explosion must precede keep/drop modifiers');
          if(result.die.kind==='standard-die'){
            if(result.die.explodeHighest)this.error('Duplicate explosion marker');
            const sides=result.die.sides;
            if(sides.kind==='literal'&&Number.isInteger(sides.value)&&sides.value>=1&&sides.value<=1000){
              result.die={kind:'custom-die',facets:Array.from({length:sides.value},(_,index)=>({kind:'value' as const,value:index+1,span:result.span,explosion:index+1===sides.value?explosion:undefined}))};
            }else result.die.explodeHighest=explosion;
          }else{
            const numeric=result.die.facets.map(face=>face.kind==='value'&&typeof face.value==='number'?face.value:undefined);
            if(numeric.some(value=>value===undefined))this.error('Trailing explosion requires fixed numeric facets; mark individual facets instead');
            const highest=Math.max(...numeric as number[]);
            for(const face of result.die.facets)if(face.kind==='value'&&face.value===highest){if(face.explosion)this.error('Duplicate explosion marker');face.explosion=explosion;}
          }
          result.span.end=this.tokens[this.index-1].end;continue;
        }
        if(this.dialect==='nodice'&&mod==='r'){
          if(result.kind!=='dice')this.error('Facet reroll must precede keep/drop modifiers');
          const reroll=this.facetReroll()!;
          if(result.die.kind==='standard-die'){
            if(result.die.rerollLowest)this.error('Duplicate reroll marker');
            const sides=result.die.sides;
            if(sides.kind==='literal'&&Number.isInteger(sides.value)&&sides.value>=1&&sides.value<=1000){
              const highestExplosion=result.die.explodeHighest;
              result.die={kind:'custom-die',facets:Array.from({length:sides.value},(_,index)=>({kind:'value' as const,value:index+1,span:result.span,facetReroll:index===0?reroll:undefined,explosion:index+1===sides.value?highestExplosion:undefined}))};
            }else result.die.rerollLowest=reroll;
          }else{
            const numeric=result.die.facets.map(face=>face.kind==='value'&&typeof face.value==='number'?face.value:undefined);
            if(numeric.some(value=>value===undefined))this.error('Trailing reroll requires fixed numeric facets; mark individual facets instead');
            const lowest=Math.min(...numeric as number[]);
            for(const face of result.die.facets)if(face.kind==='value'&&face.value===lowest){if(face.facetReroll)this.error('Duplicate reroll marker');face.facetReroll=reroll;}
          }
          result.span.end=this.tokens[this.index-1].end;continue;
        }
        break;
      }
    }
    return result;
  }
  private rangeFacets():FacetSpec[]|undefined{
    const checkpoint=this.index,first=this.at();
    const firstSign=this.take('-')?-1:1;
    if(this.at().kind!=='number'){this.index=checkpoint;return undefined;}
    const lower=this.number();
    if(!this.take('..')){this.index=checkpoint;return undefined;}
    const secondSign=this.take('-')?-1:1;
    const upper=this.number();
    if(!this.is(',')&&!this.is('}'))this.error('A facet range must end before a comma or closing brace','INVALID_FACET_RANGE');
    const start=firstSign*lower.value,end=secondSign*upper.value;
    if(!Number.isInteger(start)||!Number.isInteger(end)||end<start||end-start+1>1000)
      this.error('Facet ranges need ascending integer bounds and at most 1,000 values','INVALID_FACET_RANGE');
    const where=span(first,upper);
    return Array.from({length:end-start+1},(_,index)=>({kind:'value' as const,value:start+index,span:where}));
  }
  private facet():FacetSpec{
    const first=this.at();
    if(first.kind==='eof'||this.is(',')||this.is('}'))this.error('Expected a die facet');
    const segments:Array<{kind:'text';text:string}|{kind:'expression';expression:Node}>=[];
    let cursor=first.start,last:Span=first;
    while(!this.is(',')&&!this.is('}')&&this.at().kind!=='eof'){
      const current=this.at();
      if(current.text==='!'||current.text.toLowerCase()==='r'){
        const next=this.at(1),afterLimit=this.at(2);
        const atFacetEnd=next.text===','||next.text==='}'||(next.kind==='number'&&(afterLimit.text===','||afterLimit.text==='}'));
        const hasText=segments.some(part=>part.kind==='text'&&part.text.trim().length>0)||this.source.slice(cursor,current.start).trim().length>0;
        if(atFacetEnd&&!hasText&&segments.length===1&&segments[0].kind==='expression'&&(current.text==='!'||this.dialect==='nodice'))break;
        last=this.next();
        if(hasText&&next.kind==='number'&&(afterLimit.text===','||afterLimit.text==='}'))last=this.next();
        continue;
      }
      const keyword=current.text.toLowerCase(),next=this.at(1);
      const dieStart=(keyword==='d'&&(next.kind==='number'||next.text==='{'||next.text==='('))||(keyword==='die'&&next.text==='{');
      const resolutionStart=['p','pool','s','sum'].includes(keyword)&&(next.kind==='number'||next.text==='('||next.text.toLowerCase()==='d'||next.text.toLowerCase()==='die');
      const selectorStart=['h','l','dh','dl','highest','lowest'].includes(keyword)&&(next.kind==='number'||next.text==='('||next.text==='['||next.text.toLowerCase()==='of'||next.text.toLowerCase()==='from');
      const dropStart=keyword==='drop'&&['highest','lowest'].includes(next.text.toLowerCase());
      const expressionStart=current.kind==='number'||current.text==='('||((current.text==='-'||current.text==='+')&&(next.kind==='number'||next.text==='('||next.text.toLowerCase()==='d'))||dieStart||resolutionStart||selectorStart||dropStart;
      if(expressionStart){
        if(current.start>cursor)segments.push({kind:'text',text:this.source.slice(cursor,current.start)});
        const expression=this.additive();segments.push({kind:'expression',expression});cursor=expression.span.end;last=expression.span;
      }else{
        if(current.kind!=='word')this.error('Invalid facet text');
        last=this.next();
      }
    }
    if(last.end>cursor)segments.push({kind:'text',text:this.source.slice(cursor,last.end)});
    if(segments[0]?.kind==='text')segments[0].text=segments[0].text.trimStart();
    if(segments.at(-1)?.kind==='text')(segments.at(-1) as {kind:'text';text:string}).text=(segments.at(-1) as {kind:'text';text:string}).text.trimEnd();
    const meaningful=segments.filter(part=>part.kind==='expression'||part.text.length>0);
    const explosion=this.explosion();const facetReroll=this.dialect==='nodice'?this.facetReroll():undefined;
    if((explosion||facetReroll)&&!this.is(',')&&!this.is('}'))this.error('Facet modifier must end a facet');
    const facetSpan=span(first,explosion||facetReroll?this.tokens[this.index-1]:last);
    if(meaningful.length===1){const only=meaningful[0];if(only.kind==='text')return {kind:'value',value:only.text,span:facetSpan,explosion,facetReroll};if(only.expression.kind==='literal')return {kind:'value',value:only.expression.value,span:facetSpan,explosion,facetReroll};if(only.expression.kind==='unary'&&only.expression.value.kind==='literal')return {kind:'value',value:-only.expression.value.value,span:facetSpan,explosion,facetReroll};return {kind:'expression',expression:only.expression,span:facetSpan,explosion,facetReroll};}
    return {kind:'template',segments:meaningful,span:facetSpan,explosion,facetReroll};
  }
  private explosion():Explosion|undefined{
    if(!this.take('!'))return undefined;
    return this.at().kind==='number'?{limit:this.number().value}:{};
  }
  private facetReroll():Explosion|undefined{
    if(!this.take('r'))return undefined;
    return this.at().kind==='number'?{limit:this.number().value}:{};
  }
  private selectorName():Selector|undefined{
    const t=this.at().text.toLowerCase();
    if(t==='h'||t==='highest')return 'highest';if(t==='l'||t==='lowest')return 'lowest';
    if(t==='dh')return 'drop-highest';if(t==='dl')return 'drop-lowest';
    if(t==='drop'&&this.at(1).text.toLowerCase()==='highest')return 'drop-highest';
    if(t==='drop'&&this.at(1).text.toLowerCase()==='lowest')return 'drop-lowest';
    return undefined;
  }
  private selector(operator:Selector):Node{
    const first=this.next();if(first.text.toLowerCase()==='drop')this.next();
    let count:Node=lit(1,first);
    if(this.at().kind==='number')count=this.number();else if(this.is('('))count=this.group();
    if(this.is('of')||this.is('from'))this.next();
    const open=this.expect('[');const items:Node[]=[];
    if(this.is(']'))this.error('A selector needs a pool','EMPTY_POOL');
    items.push(this.additive());while(this.take(','))items.push(this.additive());
    const close=this.expect(']');const source:Extract<Node,{kind:'pool'}>={kind:'pool',items,span:span(open,close)};
    return {kind:'selector',operator,count,source,span:span(first,close)};
  }
}

export interface ParsedDocument { source:string; tokens:Token[]; ast:Node; diagnostics:Diagnostic[] }
function interpretationPipe(source:string):number{
  let braces=0,brackets=0,parentheses=0;
  for(let index=0;index<source.length;index++){
    const char=source[index];
    if(char==='|'&&braces===0&&brackets===0&&parentheses===0)return index;
    if(char==='{')braces++;else if(char==='}')braces--;
    else if(char==='[')brackets++;else if(char===']')brackets--;
    else if(char==='(')parentheses++;else if(char===')')parentheses--;
  }
  return -1;
}
export function parseSyntax(source:string,dialect:Dialect='nodice'):ParsedDocument{
  if(!source.trim())throw new ExpressionError('Enter an expression',true,{severity:'error',code:'EMPTY',message:'Enter an expression',start:0,end:0});
  const named=splitExpressionName(source);
  if(named.suffix&&!named.name)throw new ExpressionError('Enter a name after #');
  const sourceWithoutName=named.expression;
  const pipe=interpretationPipe(sourceWithoutName),expression=pipe<0?sourceWithoutName:sourceWithoutName.slice(0,pipe);
  const tokens=tokenize(expression);
  const inner=new Parser(tokens,dialect,expression).parse();
  const ast:Node=pipe<0?inner:{kind:'interpret',expression:inner,rules:parseInterpretationTable(sourceWithoutName.slice(pipe+1),pipe+1),span:{start:inner.span.start,end:sourceWithoutName.length}};
  return {source,tokens,ast,diagnostics:[]};
}
export function parseDocument(source:string,dialect:Dialect='nodice'):ParsedDocument{const document=parseSyntax(source,dialect);document.diagnostics=validate(document.ast);return document;}
export function parse(source:string,dialect:Dialect='nodice'):Node{const document=parseDocument(source,dialect);const error=document.diagnostics[0];if(error)throw new ExpressionError(`${error.message} at position ${error.start+1}`,false,error);return document.ast;}
/** Prefer native syntax; use the Roll20 adapter only when it accepts an otherwise invalid input. */
export function parseAuto(source:string):{ast:Node;dialect:Dialect}{
  try{return {ast:parse(source,'nodice'),dialect:'nodice'};}
  catch(nativeError){
    try{return {ast:parse(source,'roll20'),dialect:'roll20'};}
    catch{throw nativeError;}
  }
}
