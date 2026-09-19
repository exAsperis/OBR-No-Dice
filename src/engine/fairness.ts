import type { Node } from './ast';
import { roll, type Rng, type Value } from './evaluate';
import { createDieOverrideResolver, type DieOverride } from '../dieOverrides';

export interface FairnessCount { value: Value; count: number }
export interface FairnessSnapshot { total: number; counts: FairnessCount[] }

export class FairnessSampler {
  private counts = new Map<string, FairnessCount>();
  private total = 0;
  private overrideResolver?: ReturnType<typeof createDieOverrideResolver>;
  constructor(private expression: Node, private rng?: Rng, overrides: readonly DieOverride[] = []) {
    if (overrides.length) this.overrideResolver = createDieOverrideResolver(overrides);
  }

  sample(amount: number): FairnessSnapshot {
    for (let i = 0; i < amount; i++) {
      const value = roll(this.expression, this.rng, false,
        this.overrideResolver ? {dieOverride:this.overrideResolver} : undefined).value;
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
