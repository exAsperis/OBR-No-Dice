import { ExpressionError, type Diagnostic, type Span } from './ast';
export type TokenKind = 'number' | 'word' | 'symbol' | 'eof';
export interface Token extends Span { kind: TokenKind; text: string }
const isDigit=(c:string)=>c>='0'&&c<='9';
const isLetter=(c:string)=>/[A-Za-z_]/.test(c);
export function tokenize(source:string):Token[] {
  const tokens:Token[]=[]; let i=0;
  while(i<source.length) {
    const c=source[i]; if(/\s/.test(c)){i++;continue;}
    const start=i;
    if(c==='.'&&source[i+1]==='.'){
      i+=2;tokens.push({kind:'symbol',text:'..',start,end:i});continue;
    }
    if(isDigit(c)||(c==='.'&&isDigit(source[i+1]??''))) {
      while(isDigit(source[i]??''))i++;
      if(source[i]==='.'&&isDigit(source[i+1]??'')){i++;while(isDigit(source[i]??''))i++;}
      tokens.push({kind:'number',text:source.slice(start,i),start,end:i});continue;
    }
    if(isLetter(c)) {
      while(isLetter(source[i]??''))i++;
      tokens.push({kind:'word',text:source.slice(start,i),start,end:i});continue;
    }
    if('+-*/(){}[],!<=>'.includes(c)) {
      i++; if((c==='<'||c==='>')&&source[i]==='=')i++;
      tokens.push({kind:'symbol',text:source.slice(start,i),start,end:i});continue;
    }
    const diagnostic:Diagnostic={severity:'error',code:'UNEXPECTED_CHARACTER',message:`Unexpected character '${c}'`,start,end:start+1};
    throw new ExpressionError(`${diagnostic.message} at position ${start+1}`,false,diagnostic);
  }
  tokens.push({kind:'eof',text:'',start:i,end:i});return tokens;
}
