import { ExpressionError, type Comparator, type Diagnostic, type Dialect, type Facet, type Node, type ResolutionMode, type Selector, type Span } from './ast';
import { tokenize, type Token } from './tokenizer';
import { validate } from './validate';

const span=(a:Span|Node,b:Span|Node):Span=>({start:'span'in a?a.span.start:a.start,end:'span'in b?b.span.end:b.end});
const lit=(value:number,where:Span):Extract<Node,{kind:'literal'}>=>({kind:'literal',value,span:where});
const word=(token:Token,value:string)=>token.kind==='word'&&token.text.toLowerCase()===value;

class Parser {
  private index=0;
  constructor(private tokens:Token[],private dialect:Dialect){}
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
      const facets:Facet[]=[];
      if(this.is('}'))this.error('A die must have at least one facet','EMPTY_DIE');
      do{facets.push(this.facet());}while(this.take(','));
      end=this.expect('}');die={kind:'custom-die',facets};
    }else if(this.is('(')){
      const sides=this.group();die={kind:'standard-die',sides};end=sides.span;
    }else if(this.at().kind==='number'){
      const sides=this.number();die={kind:'standard-die',sides};end=sides.span;
    }else this.error(`Expected die facets or size after '${marker.text}'`);
    if(marker.text.toLowerCase()==='die'&&die.kind==='standard-die')this.error("Long 'die' requires a facet list");
    let result:Node={kind:'dice',quantity,die,resolution,explode:false,span:span(start??(quantity.span.start===marker.start?marker:quantity),end)};
    {
      while(true){
        const mod=this.at().text.toLowerCase();
        if(this.dialect==='roll20'&&['kh','kl','dh','dl'].includes(mod)){
          const op=this.next();const count=this.number();const source:Node={kind:'pool',items:[result],span:result.span};
          result={kind:'selector',operator:({kh:'highest',kl:'lowest',dh:'drop-highest',dl:'drop-lowest'} as Record<string,Selector>)[mod],count,source:source as Extract<Node,{kind:'pool'}>,span:span(result,count)};continue;
        }
        if(['r','ro'].includes(mod)){
          if(result.kind!=='dice')this.error('Reroll must precede keep/drop modifiers');
          const r=this.next();let comparator:Comparator='=';
          if(['<','<=','=','>','>='].includes(this.at().text))comparator=this.next().text as Comparator;
          const sign=this.take('-');const target=this.number();result.reroll={once:mod==='ro',comparator,target:(sign?-1:1)*target.value};result.span.end=target.span.end;void r;continue;
        }
        if(this.take('!')){if(result.kind!=='dice')this.error('Explosion must precede keep/drop modifiers');result.explode=true;result.span.end=this.tokens[this.index-1].end;continue;}
        break;
      }
    }
    return result;
  }
  private facet():Facet{
    const sign=this.take('-')?-1:1;const t=this.at();
    if(t.kind==='number'){
      this.next();let value=Number(t.text)*sign;
      if(this.take('/')){const denominator=this.number();if(denominator.value===0)this.error('Facet denominator cannot be zero','ZERO_DENOMINATOR');value/=denominator.value;}
      return value;
    }
    if(sign===-1)this.error('A symbolic facet cannot be negative');
    if(t.kind==='word'){
      this.next();let symbol=t.text;let end=t.end;
      while((this.at().kind==='word'||this.at().kind==='number')&&this.at().start===end){const part=this.next();symbol+=part.text;end=part.end;}
      return symbol;
    }
    this.error('Expected a die facet');
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
export function parseSyntax(source:string,dialect:Dialect='nodice'):ParsedDocument{
  if(!source.trim())throw new ExpressionError('Enter an expression',true,{severity:'error',code:'EMPTY',message:'Enter an expression',start:0,end:0});
  const tokens=tokenize(source);return {source,tokens,ast:new Parser(tokens,dialect).parse(),diagnostics:[]};
}
export function parseDocument(source:string,dialect:Dialect='nodice'):ParsedDocument{const document=parseSyntax(source,dialect);document.diagnostics=validate(document.ast);return document;}
export function parse(source:string,dialect:Dialect='nodice'):Node{const document=parseDocument(source,dialect);const error=document.diagnostics[0];if(error)throw new ExpressionError(`${error.message} at position ${error.start+1}`,false,error);return document.ast;}
