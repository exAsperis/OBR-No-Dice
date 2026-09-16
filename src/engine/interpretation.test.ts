import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { roll, type Rng } from './evaluate';
import { distribution } from './probability';
import { formatShort } from './format';
import { parseInterpretationCondition } from './interpretation';

const fixed=(...values:number[]):Rng=>{let index=0;return {integer:()=>values[index++]};};

describe('result interpretation',()=>{
  const source='2d6 | 6-:Fail; 7-9:Partial success; 10+:Success';
  it('matches inclusive shorthand and preserves the numeric result',()=>{
    expect(roll(parse(source),fixed(1,2))).toMatchObject({value:5,interpretation:'Fail'});
    expect(roll(parse(source),fixed(2,3))).toMatchObject({value:7,interpretation:'Partial success'});
    expect(roll(parse(source),fixed(4,5))).toMatchObject({value:11,interpretation:'Success'});
    expect(distribution(parse(source)).entries.find(entry=>entry.value===7)?.probability).toBeCloseTo(6/36);
  });
  it('supports comparison spelling, first-match precedence, and gaps',()=>{
    const ast=parse('d20 | <=6:Low; 7-10:First overlap; 8-12:Later; >=15:High');
    expect(roll(ast,fixed(5)).interpretation).toBe('Low');
    expect(roll(ast,fixed(7)).interpretation).toBe('First overlap');
    expect(roll(ast,fixed(12)).interpretation).toBeUndefined();
    expect(roll(ast,fixed(14)).interpretation).toBe('High');
  });
  it('keeps labels literal and formats from the interpretation AST',()=>{
    const ast=parse('d6 | 1-:Roll d20+2!; 2+:A bag of d100 gold pieces');
    expect(roll(ast,fixed(0)).interpretation).toBe('Roll d20+2!');
    expect(roll(ast,fixed(1)).interpretation).toBe('A bag of d100 gold pieces');
    expect(formatShort(ast)).toBe('d6 | <=1:Roll d20+2!; >=2:A bag of d100 gold pieces');
    expect(parseInterpretationCondition('-3--1')).toEqual({kind:'range',minimum:-3,maximum:-1});
  });
  it('rejects malformed tables and nonnumeric results',()=>{
    for(const text of ['d6 |','d6 | 6-Fail','d6 | 6-:','d6 | 10-7:Impossible','d6 | ; 1:Yes','d{Miss,Hit} | 1:Yes','p2d6 | 2:Yes'])expect(()=>parse(text),text).toThrow();
  });
});
