import type { Node } from './ast';
import { roll, type Rng, type Value } from './evaluate';

export interface FairnessCount { value: Value; count: number }
export interface FairnessSnapshot { total: number; counts: FairnessCount[] }

export class FairnessSampler {
  private counts = new Map<string, FairnessCount>();
  private total = 0;
  constructor(private expression: Node, private rng?: Rng) {}

  sample(amount: number): FairnessSnapshot {
    for (let i = 0; i < amount; i++) {
      const value = roll(this.expression, this.rng, false).value;
      const key = JSON.stringify(value);
      const previous = this.counts.get(key);
      if (previous) previous.count++;
      else this.counts.set(key, { value, count: 1 });
      this.total++;
    }
    return this.snapshot();
  }

  snapshot(): FairnessSnapshot {
    return { total: this.total, counts: [...this.counts.values()].map(item => ({ ...item })) };
  }
}
