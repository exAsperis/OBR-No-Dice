import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { FairnessSampler } from './fairness';

describe('fairness sampler', () => {
  it('accumulates deterministic numeric results without changing the expression', () => {
    let next = 0;
    const sampler = new FairnessSampler(parse('d6'), { integer: () => next++ % 6 });
    expect(sampler.sample(6)).toEqual({ total: 6, counts: [1,2,3,4,5,6].map(value => ({ value, count: 1 })) });
    expect(sampler.sample(6).counts).toEqual([1,2,3,4,5,6].map(value => ({ value, count: 2 })));
  });

  it('accumulates categorical results', () => {
    let next = 0;
    const sampler = new FairnessSampler(parse('d{Miss,Hit}'), { integer: () => next++ % 2 });
    expect(sampler.sample(3)).toEqual({ total: 3, counts: [{ value: 'Miss', count: 2 }, { value: 'Hit', count: 1 }] });
  });
});
