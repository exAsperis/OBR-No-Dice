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
    expect(result.stages).toEqual(['H(d4)[4d6]+2', 'H3[2,5,6,1] + 2', '[2, 5, 6] + 2', '13 + 2']);
    expect(result.value).toBe(15);
  });
});
