import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { roll, type Rng } from './evaluate';

const fixed = (...values: number[]): Rng => { let i = 0; return { integer: () => values[i++] }; };

describe('whole-expression presentation', () => {
  it('reduces a numeric dice expression in place', () => {
    const result = roll(parse('2d6+2'), fixed(1,2));
    expect(result.stages).toEqual(['2d6+2', '[2, 3] + 2', '5 + 2']);
    expect(result.value).toBe(7);
  });
  it('shows a dynamic selector, retained pool, and arithmetic', () => {
    const result = roll(parse('H(d4)[4d6]+2'), fixed(2,1,4,5,0));
    expect(result.stages).toEqual(['H(d4)[4d6]+2', 'H3[4d6] + 2', 'H3[2,5,6,1] + 2', '[2, 5, 6] + 2', '13 + 2']);
    expect(result.value).toBe(15);
  });
  it('shows quantity, die size, then the outer roll as separate reductions', () => {
    const result = roll(parse('(d4)d(d6)'), fixed(1, 4, 1, 4));
    expect(result.stages).toEqual(['(d4)d(d6)', '2d(d6)', '2d5', '[2, 5]', '7']);
    expect(result.value).toBe(7);
    expect(result.trace.findIndex(step => step.includes('d4 →'))).toBeLessThan(result.trace.findIndex(step => step.includes('d6 →')));
  });
  it('selects custom facets before resolving their nested rolls', () => {
    const result = roll(parse('(d2)d{d4,d6,d8,d10,d12,d20}'), fixed(1, 2, 0, 4, 2));
    expect(result.stages).toEqual(['(d2)d{d4,d6,d8,d10,d12,d20}', '2d{d4,d6,d8,d10,d12,d20}', '[d8, d4]', '[5, d4]', '[5, 3]', '8']);
    expect(result.value).toBe(8);
  });
  it('logs each roll inside an arithmetic dice quantity', () => {
    const result = roll(parse('(d4+d6)d8'), fixed(1, 2, 0, 1, 2, 3, 4));
    expect(result.stages.slice(0, 4)).toEqual(['(d4+d6)d8', '(2 + d6)d8', '(2 + 3)d8', '5d8']);
  });
  it('presents each exploding draw as its own reduction', () => {
    const result=roll(parse('d6!'),fixed(5,5,4));
    expect(result.stages).toEqual(['d6!','[6!]','6 + d6!','6 + [6!]','6 + 6 + d6!','6 + 6 + [5]','6 + 6 + 5','17']);
    expect(result.stageDice).toEqual(['','d6','','d6','','d6','','']);
    expect(result.stageDrawIndices).toEqual([[],[0],[],[1],[],[2],[],[]]);
    expect(result.dice?.map(draw=>draw.exploded??false)).toEqual([true,true,false]);
    expect(result.dice?.map(draw=>draw.explosionNumber)).toEqual([1,2,undefined]);
  });
  it('presents separate draws across an exploding pool', () => {
    const result=roll(parse('2d6!'),fixed(5,4,2));
    expect(result.stages).toEqual(['2d6!','[6!, d6!]','[6 + d6!, d6!]','[6 + 3, d6!]','[9, 5]','14']);
    expect(result.stageDrawIndices).toEqual([[],[0],[],[1],[2],[]]);
  });
  it('presents a nontriggering exploding die exactly once', () => {
    const result=roll(parse('d6!'),fixed(3));
    expect(result.stages).toEqual(['d6!','[4]','4']);
    expect(result.stageDice).toEqual(['','d6','']);
    expect(result.stageDrawIndices).toEqual([[],[0],[]]);
    expect(result.dice?.map(draw=>draw.exploded??false)).toEqual([false]);
  });
  it('presents rerolled dice and their replacement roll separately', () => {
    const result=roll(parse('4d4r'),fixed(0,2,3,0,1,2));
    expect(result.stages).toContain('[1r, 3, 4, 1r]');
    expect(result.stageDice).toContain('2d4r');
    expect(result.stageDrawIndices?.find(indices=>indices.length===2)).toEqual([1,5]);
    expect(result.stageDice?.filter(Boolean)).toEqual(['4d4r', '2d4r']);
    const limited=roll(parse('4d4r2'),fixed(0,2,3,0,0,1,2));
    expect(limited.stageDice).toContain('2d4r1');
    expect(limited.stageDice).toContain('d4');
  });
});
