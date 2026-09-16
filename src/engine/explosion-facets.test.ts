import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { roll, type Rng } from './evaluate';
import { distribution } from './probability';
import { formatLongExpanded, formatShort } from './format';

const fixed=(...sequence:number[]):Rng=>{let index=0;return {integer:n=>sequence[index++]%n};};
describe('facet explosion',()=>{
  it('treats conventional ! as highest-facet shorthand',()=>{
    const parsed=parse('d6!');expect(parsed.kind).toBe('dice');
    if(parsed.kind!=='dice'||parsed.die.kind!=='custom-die')throw new Error('Expected facet-level explosion in the AST');
    expect(parsed.die.facets[5].explosion).toEqual({});
    expect(formatShort(parse('d{1,2,3,4,5,6!}'))).toBe('d6!');
    expect(formatShort(parse('d{1,2,3,4,5,6!2}'))).toBe('d6!2');
    expect(formatLongExpanded(parse('d6!2'))).toBe('die{1,2,3,4,5,6!2}');
    expect(formatShort(parse(formatLongExpanded(parse('d6!2'))))).toBe('d6!2');
    expect(formatShort(parse('d{1,2,3,4,5!,6!}'))).toBe('d{1,2,3,4,5!,6!}');
  });
  it('continues after either marked facet',()=>{
    const ast=parse('d{1,2,3,4,5!,6!}');
    const five=roll(ast,fixed(4,5,0));expect(five.value).toBe(12);expect(five.trace.filter(step=>step.startsWith('explode'))).toHaveLength(2);
    const six=roll(ast,fixed(5,4,1));expect(six.value).toBe(13);
  });
  it('caps additional rolls at the stated limit',()=>{
    let calls=0;const rng:Rng={integer:n=>{calls++;return (n-1)%n;}};
    const result=roll(parse('d6!2'),rng);
    expect(result.value).toBe(18);expect(calls).toBe(3);
    expect(result.trace.filter(step=>step.startsWith('explode'))).toHaveLength(2);
    expect(roll(parse('d{1,2,3,4,5,6!2}'),fixed(5,5,5)).value).toBe(18);
    expect(roll(parse('d1!2'),fixed(0,0,0)).value).toBe(3);
  });
  it('calculates bounded explosion probabilities exactly',()=>{
    const pmf=distribution(parse('d6!2'));
    const chance=(value:number)=>pmf.entries.find(entry=>entry.value===value)?.probability??0;
    expect(pmf.exact).toBe(true);
    expect(chance(1)).toBeCloseTo(1/6);
    expect(chance(6)).toBe(0);
    expect(chance(7)).toBeCloseTo(1/36);
    expect(chance(13)).toBeCloseTo(1/216);
    expect(chance(18)).toBeCloseTo(1/216);
    expect(pmf.entries.reduce((sum,entry)=>sum+entry.probability,0)).toBeCloseTo(1);
    expect(pmf.range).toEqual([1,18]);
    expect(distribution(parse('d{1,2,3,4,5!2,6!2}')).exact).toBe(true);
    expect(distribution(parse('d1!2')).entries).toEqual([{value:3,probability:1}]);
  });
  it('estimates unbounded explosions and preserves inner exploding dice in text',()=>{
    expect(distribution(parse('d{1,2,3,4,5!,6!}')).exact).toBe(false);
    expect(roll(parse('d{d6!2 dogs}'),fixed(0,5,5,2)).value).toBe('15 dogs');
  });
  it('keeps punctuation in nonnumeric facets and rejects impossible explosions',()=>{
    expect(roll(parse('d{Miss!,Hit}'),fixed(0)).value).toBe('Miss!');
    expect(roll(parse('H[d{Miss!2,Hit}]'),fixed(0)).value).toBe('Miss!2');
    expect(roll(parse('d{5! cats}'),fixed(0)).value).toBe('5! cats');
    for(const source of ['d6!0','d6!1.5','d1!','d{1!}','d{1!,2!}'])expect(()=>parse(source),source).toThrow();
  });
  it('stops an unlucky unlimited explosion across nested facet evaluation',()=>{
    const alwaysFirst:Rng={integer:()=>0};
    expect(()=>roll(parse('d{1!,2}'),alwaysFirst)).toThrow(/safety limit/);
    expect(()=>roll(parse('d{d{1!,2}}'),alwaysFirst)).toThrow(/safety limit/);
  });
});
