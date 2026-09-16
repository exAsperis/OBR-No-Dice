import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { roll, type Rng } from './evaluate';
import { distribution } from './probability';
import { formatLongExpanded, formatLongReadable, formatShort } from './format';

const fixed=(...values:number[]):Rng=>{let index=0;return {integer:n=>values[index++]%n};};
describe('evaluated custom facets',()=>{
  it('chooses one equally weighted expression, then evaluates it',()=>{
    const ast=parse('d{d4, d6+1, 2d8}');
    expect(roll(ast,fixed(0,2)).value).toBe(3);
    expect(roll(ast,fixed(1,4)).value).toBe(6);
    expect(roll(ast,fixed(2,1,6)).value).toBe(9);
    expect(roll(ast,fixed(0,2)).trace.join(' ')).toContain('facet 1/3 → d4');
    expect(formatShort(ast)).toBe('d{d4,d6+1,2d8}');
    expect(formatLongReadable(ast)).toBe('die{d4,d6+1,2 d8}');
    expect(formatShort(parse(formatLongReadable(ast)))).toBe(formatShort(ast));
  });
  it('computes the exact mixture distribution',()=>{
    const result=distribution(parse('d{d4,d6+1,2d8}'));
    expect(result.exact).toBe(true);
    expect(result.entries.reduce((sum,item)=>sum+item.probability,0)).toBeCloseTo(1);
    expect(result.entries.find(item=>item.value===1)?.probability).toBeCloseTo(1/12);
    expect(result.mean).toBeCloseTo((2.5+4.5+9)/3);
  });
  it('renders trailing and embedded text around evaluated values',()=>{
    const phrase=parse('d{d6 cats, d4! dogs, 3 naughty pigeons}');
    expect(roll(phrase,fixed(0,1)).value).toBe('2 cats');
    expect(roll(phrase,fixed(1,3,3,2)).value).toBe('11 dogs');
    expect(roll(phrase,fixed(2)).value).toBe('3 naughty pigeons');
    expect(roll(parse('d{A bag of d100 gold pieces}'),fixed(0,41)).value).toBe('A bag of 42 gold pieces');
    expect(roll(parse('d{d6 cats and d4 dogs}'),fixed(0,1,2)).value).toBe('2 cats and 3 dogs');
    expect(roll(parse('d{A bag of d100 gold pieces}'),fixed(0,41)).trace.join(' ')).toContain('facet result → A bag of 42 gold pieces');
    expect(distribution(parse('d{d4! dogs,3 pigeons}')).exact).toBe(false);
  });
  it('treats generated text as categorical outcomes',()=>{
    const result=distribution(parse('d{d2 cats,3 pigeons}'));
    expect(result.exact).toBe(true);
    expect(result.entries.find(item=>item.value==='1 cats')?.probability).toBeCloseTo(.25);
    expect(result.entries.find(item=>item.value==='2 cats')?.probability).toBeCloseTo(.25);
    expect(result.entries.find(item=>item.value==='3 pigeons')?.probability).toBeCloseTo(.5);
    const pair=distribution(parse('d{d2 cats and d2 dogs}'));
    expect(pair.entries).toHaveLength(4);
    expect(pair.entries.every(item=>Math.abs(item.probability-.25)<1e-10)).toBe(true);
  });
  it('weights repeated branches without evaluating unchosen ones',()=>{
    const distributionResult=distribution(parse('d{d2,d2,3}'));
    expect(distributionResult.entries.find(item=>item.value===1)?.probability).toBeCloseTo(1/3);
    expect(distributionResult.entries.find(item=>item.value===3)?.probability).toBeCloseTo(1/3);
    let calls=0;const result=roll(parse('d{d2,d4}'),{integer:n=>{calls++;return calls===1?0:1%n;}});
    expect(result.value).toBe(2);expect(calls).toBe(2);
  });
  it('round trips formatted facet templates',()=>{
    for(const source of ['d{d6 cats,d4! dogs,3 naughty pigeons}','d{A bag of d100 gold pieces}','d{d6 cats and d4 dogs}']){
      const short=formatShort(parse(source));
      expect(formatShort(parse(short))).toBe(short);
      expect(formatShort(parse(formatLongReadable(parse(source))))).toBe(short);
      expect(formatShort(parse(formatLongExpanded(parse(source))))).toBe(short);
    }
    expect(roll(parse('d{A pool of d6 gold}'),fixed(0,2)).value).toBe('A pool of 3 gold');
  });
  it('treats exclamation marks in text facets as text',()=>{
    expect(roll(parse('d{Miss!,Hit}'),fixed(0)).value).toBe('Miss!');
    expect(roll(parse('d{5! cats}'),fixed(0)).value).toBe('5! cats');
    expect(roll(parse('d{A bag of 5!}'),fixed(0)).value).toBe('A bag of 5!');
    expect(roll(parse('d{d6 cats!}'),fixed(0,1)).value).toBe('2 cats!');
    expect(formatShort(parse('d{Miss!,Hit}'))).toBe('d{Miss!,Hit}');
  });
  it('rejects invalid facet procedures',()=>{
    expect(()=>parse('s2d{d6 cats,d4 dogs}')).toThrow();
    expect(()=>parse('H[d{d6 cats,d4 dogs}]')).toThrow();
    expect(()=>parse('d{p2d6,1}')).toThrow();
  });
});
