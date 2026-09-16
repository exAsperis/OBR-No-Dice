import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { formatShort, formatLongExpanded } from './format';
import { roll } from './evaluate';
import { distribution } from './probability';

const fixed=(...faces:number[])=>({integer:()=>{const face=faces.shift();if(face===undefined)throw new Error('Unexpected draw');return face;}});

describe('facet rerolls',()=>{
  it('rerolls the lowest standard face and round trips',()=>{
    expect(formatShort(parse('d{1r,2,3,4,5,6}'))).toBe('d6r');
    expect(formatLongExpanded(parse('2d6r1'))).toBe('2 die{1r1,2,3,4,5,6}');
    expect(roll(parse('2d6r'),fixed(0,0,3,1)).value).toBe(6);
  });
  it('limits each marked facet independently',()=>{
    const ast=parse('d{1r,2r1,3,4,5,6}');
    expect(roll(ast,fixed(1,0,0,2)).value).toBe(3);
    expect(roll(ast,fixed(1,1)).value).toBe(2);
    expect(roll(parse('d6r1'),fixed(0,0)).value).toBe(1);
  });
  it('computes bounded rerolls exactly and estimates unlimited ones',()=>{
    const result=distribution(parse('d6r1'));
    expect(result.exact).toBe(true);
    expect(result.entries.find(entry=>entry.value===1)?.probability).toBeCloseTo(1/36);
    expect(distribution(parse('d6r')).exact).toBe(false);
  });
  it('rejects invalid limits and certain infinite loops',()=>{
    for(const source of ['d6r0','d6r1.5','d1r','d{1r,2r}'])expect(()=>parse(source),source).toThrow();
  });
});
