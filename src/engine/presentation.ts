import type { Node } from './ast';
import { formatShort } from './format';

const selectorName = { highest: 'H', lowest: 'L', 'drop-highest': 'DH', 'drop-lowest': 'DL' } as const;
const precedence = (node: Node) => node.kind === 'binary' ? (node.op === '+' || node.op === '-' ? 1 : 2) : node.kind === 'unary' ? 3 : 4;

/** Records whole-expression reductions without interpreting expression text. */
export class PresentationRecorder {
  private replacements = new WeakMap<Node, string>();
  readonly stages: string[];
  /** Die responsible for each stage, aligned with stages; blank means a non-roll reduction. */
  readonly stageDice: string[];
  private root: Node;
  constructor(root: Node, private enabled = true) { this.root = root.kind === 'interpret' ? root.expression : root; this.stages = enabled ? [formatShort(this.root)] : []; this.stageDice = enabled ? [''] : []; }

  replace(node: Node, text: string): void { if (this.enabled) this.replacements.set(node, text); }
  show(rolledDie = ''): void {
    if (!this.enabled) return;
    const next = this.render(this.root);
    if (next !== this.stages.at(-1)) { this.stages.push(next); this.stageDice.push(rolledDie); }
  }
  isRoot(node: Node): boolean { return node === this.root; }

  private render(node: Node, parent = 0): string {
    const replacement = this.replacements.get(node);
    if (replacement !== undefined) return replacement;
    if (node.kind === 'group') return this.replacements.has(node.value) ? this.render(node.value) : `(${this.render(node.value)})`;
    let output: string;
    switch (node.kind) {
      case 'literal': output = String(node.value); break;
      case 'unary': output = `-${this.render(node.value, 3)}`; break;
      case 'binary': {
        const rank = precedence(node);
        output = `${this.render(node.left, rank)} ${node.op} ${this.render(node.right, rank + 1)}`;
        break;
      }
      case 'selector': {
        const count = node.count.kind === 'literal' && node.count.value === 1 ? '' : this.render(node.count);
        const source = this.replacements.get(node.source) ?? node.source.items.map(item => this.render(item)).join(',');
        output = `${selectorName[node.operator]}${count}[${source}]`;
        break;
      }
      case 'pool': output = `pool(${node.items.map(item => this.render(item)).join(',')})`; break;
      case 'resolve': output = `${node.resolution === 'pool' ? 'p' : 's'}${this.render(node.value)}`; break;
      case 'dice': {
        const quantity = node.quantity.kind === 'literal' && node.quantity.value === 1 ? '' : this.render(node.quantity);
        const prefix = node.resolution === 'inferred' ? '' : node.resolution === 'pool' ? 'p' : 's';
        const reroll = node.reroll ? `${node.reroll.once ? 'ro' : 'r'}${node.reroll.comparator}${node.reroll.target}` : '';
        if (node.die.kind === 'standard-die') {
          const die = `d${this.render(node.die.sides)}${node.die.explodeHighest ? `!${node.die.explodeHighest.limit ?? ''}` : ''}${node.die.rerollLowest ? `r${node.die.rerollLowest.limit ?? ''}` : ''}`;
          output = `${prefix}${quantity}${die}${reroll}`;
        } else {
          const unit = formatShort({ ...node, quantity: { kind: 'literal', value: 1, span: node.quantity.span }, resolution: 'inferred', reroll: undefined });
          output = `${prefix}${quantity}${unit}${reroll}`;
        }
        break;
      }
      case 'interpret': output = this.render(node.expression); break;
    }
    return precedence(node) < parent ? `(${output})` : output;
  }
}
