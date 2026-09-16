import { describe, expect, it } from 'vitest';
import { parse, parseDocument, parseSyntax } from './parser';
import { formatLongExpanded, formatLongReadable, formatShort } from './format';
import { roll, type Rng } from './evaluate';
import { distribution } from './probability';
import { resolveSemantics } from './semantics';
import type { Node } from './ast';

const rng=(...values:number[]):Rng=>{let i=0;return {integer:n=>values[i++]%n};};
function semantic(node:Node):unknown{
  switch(node.kind){
    case 'literal':return ['literal',node.value];
    case 'interpret':return ['interpret',semantic(node.expression),node.rules.map(rule=>[rule.condition,rule.label])];
    case 'group':return semantic(node.value);
    case 'unary':return ['unary',node.op,semantic(node.value)];
    case 'binary':return ['binary',node.op,semantic(node.left),semantic(node.right)];
    case 'pool':return ['pool',node.items.map(semantic)];
    case 'resolve':return ['resolve',node.resolution,semantic(node.value)];
    case 'selector':return ['selector',node.operator,semantic(node.count),semantic(node.source)];
    case 'dice':{
      let die:unknown;
      if(node.die.kind==='standard-die')die=['standard',semantic(node.die.sides),node.die.explodeHighest??null];
      else{
        const sorted=node.die.facets.filter(f=>f.kind==='value'&&typeof f.value==='number').map(f=>(f as Extract<typeof f,{kind:'value'}>).value as number).sort((a,b)=>a-b);
        const conventional=sorted.length===node.die.facets.length&&sorted.every((value,index)=>value===index+1)&&node.die.facets.every(f=>!f.explosion||(f.kind==='value'&&f.value===sorted.length));
        die=conventional?['standard',['literal',sorted.length],node.die.facets.find(f=>f.kind==='value'&&f.value===sorted.length)?.explosion??null]:['custom',node.die.facets.map(f=>f.kind==='value'?['value',f.value,f.explosion??null]:f.kind==='expression'?['expression',semantic(f.expression),f.explosion??null]:['template',f.segments.map(s=>s.kind==='text'?['text',s.text]:['expression',semantic(s.expression)]),f.explosion??null])];
      }
      return ['dice',semantic(node.quantity),die,node.resolution,node.reroll??null];
    }
  }
}
const valid=[
  'd6','d7','d{0,0,1,1}','d{-1,0,1}','d{Miss,Miss,Hit,Crit}',
  '2d6','p2d6','pool 2d6','s2d6','sum 2d6',
  'H[2d8]','H1[2d8]','H2[3d4]','L[2d20]','L2[4d10]',
  'DH[4d6]','DH2[5d6]','DL[4d6]','DL2[6d10]',
  'H2[2d6,d8]','H[s2d6,d8]','H[p2d6,d8]',
  'H(d4)[5d6]','(d4)d6','p(d4)d6','s(d4)d6',
  'd(d{4,6,8})','(d4)d(d{4,6,8})',
  'die{1,2,3,4,5,6}','highest 2 of [3 die{1,2,3,4}]','highest 2 of [pool 3d4]',
  'highest 1 of [sum 2d6,d8]','drop highest 2 from [5d6]',
  'pool(d4,d6)','sum(d4,d6)','(2+3)*d6',
  '2d6 | 6-:Fail; 7-9:Partial success; 10+:Success'
];
describe('unified notation',()=>{
  it.each(valid)('round trips %s through short and both long forms',input=>{
    const ast=parse(input);const short=formatShort(ast);
    expect(semantic(parse(short))).toEqual(semantic(ast));
    expect(semantic(parse(formatLongReadable(ast)))).toEqual(semantic(ast));
    expect(semantic(parse(formatLongExpanded(ast)))).toEqual(semantic(ast));
  });
  it('uses canonical abbreviations and expanded die facets',()=>{
    expect(formatShort(parse('die{1,2,3,4,5,6}'))).toBe('d6');
    expect(formatShort(parse('die{0,0,1,1}'))).toBe('d{0,0,1,1}');
    expect(formatLongReadable(parse('d{0,0,1,1}'))).toBe('die{0,0,1,1}');
    expect(formatShort(parse('pool 2d6'))).toBe('p2d6');
    expect(formatShort(parse('highest 1 of [sum 2d6,d8]'))).toBe('H[s2d6,d8]');
    expect(formatShort(parse('highest 2 of [pool 3d4]'))).toBe('H2[p3d4]');
    expect(formatLongReadable(parse('H2[3d4]'))).toBe('highest 2 of [3 d4]');
    expect(formatLongExpanded(parse('H2[3d4]'))).toBe('highest 2 of [3 die{1,2,3,4}]');
    expect(formatShort(parse('DL1[4d6]'))).toBe('DL[4d6]');
  });
  it('keeps inferred, pool and sum modes distinct in the AST',()=>{
    const inferred=parse('H[2d6,d8]');const summed=parse('H[s2d6,d8]');const pooled=parse('H[p2d6,d8]');
    expect(inferred.kind).toBe('selector');
    if(inferred.kind!=='selector'||summed.kind!=='selector'||pooled.kind!=='selector')throw new Error('unexpected AST');
    expect(inferred.source.items[0]).toMatchObject({kind:'dice',resolution:'inferred'});
    expect(summed.source.items[0]).toMatchObject({kind:'dice',resolution:'sum'});
    expect(pooled.source.items[0]).toMatchObject({kind:'dice',resolution:'pool'});
    expect(resolveSemantics(inferred).modeFor(inferred.source.items[0] as Extract<typeof inferred.source.items[number],{kind:'dice'}>)).toBe('pool');
    expect(resolveSemantics(summed).modeFor(summed.source.items[0] as Extract<typeof summed.source.items[number],{kind:'dice'}>)).toBe('sum');
    expect(roll(inferred,rng(2,4,5)).value).toBe(6);
    expect(roll(summed,rng(2,4,5)).value).toBe(8);
    expect(roll(pooled,rng(2,4,5)).value).toBe(6);
    expect(roll(parse('H2[2d6,d8]'),rng(2,4,5)).value).toBe(11);
  });
  it('evaluates dynamic counts, quantities and sizes once',()=>{
    expect(roll(parse('H(d4)[5d6]'),rng(2,0,1,2,3,4)).value).toBe(12);
    expect(roll(parse('(d4)d6'),rng(2,0,1,2)).value).toBe(6);
    expect(roll(parse('p(d4)d6'),rng(2,0,1,2)).value).toEqual([1,2,3]);
    expect(roll(parse('d(d{4,6,8})'),rng(1,5)).value).toBe(6);
    expect(roll(parse('(d4)d(d{4,6,8})'),rng(2,1,0,1,2)).value).toBe(6);
    expect(distribution(parse('(d2)d2')).exact).toBe(true);
    expect(distribution(parse('(d2)d2')).entries.find(e=>e.value===2)?.probability).toBeCloseTo(3/8);
  });
  it('uses the first occurrence for duplicate symbolic ranks',()=>{
    expect(roll(parse('H[2d{Miss,Hit,Miss,Crit}]'),rng(2,1)).value).toBe('Hit');
    const entries=distribution(parse('H[2d{Miss,Hit,Crit}]')).entries;
    expect(entries.find(e=>e.value==='Miss')?.probability).toBeCloseTo(1/9);
    expect(entries.find(e=>e.value==='Crit')?.probability).toBeCloseTo(5/9);
  });
  it('handles rational facets and weighted probabilities',()=>{
    expect(distribution(parse('d{1/2,1/2,1}')).entries).toEqual([{value:.5,probability:2/3},{value:1,probability:1/3}]);
    expect(formatShort(parse('d{1/2,1}'))).toBe('d{0.5,1}');
  });
  it('rejects known author errors in semantic validation',()=>{
    for(const source of ['H3[2d8]','H2[s2d6]','s3d{Miss,Hit,Crit}','d{}','0d6','d0','H(d4)[2d6]','(d{0,1})d6','d(d{0,6})','d{Miss,Hit}+1','p2d6+1','(p2d6)d6'])expect(()=>parse(source),source).toThrow();
    expect(parseDocument('H3[2d8]').diagnostics[0]).toMatchObject({severity:'error',code:'SELECTOR_EXCEEDS_POOL',start:0});
  });
  it('retains source and token/AST spans',()=>{
    const document=parseSyntax('H[2d6,d8]');expect(document.source).toBe('H[2d6,d8]');expect(document.tokens[0]).toMatchObject({text:'H',start:0,end:1});expect(document.ast.span).toEqual({start:0,end:9});
  });
});
