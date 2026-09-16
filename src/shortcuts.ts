import type { Node } from './engine/ast';
import { formatShort } from './engine/format';
import { parseAuto } from './engine/parser';

export const DICE_SHORTCUTS = [
  { label: 'Coin', term: 'd{0,1}' },
  { label: 'd4', term: 'd4' },
  { label: 'd6', term: 'd6' },
  { label: 'd8', term: 'd8' },
  { label: 'd10', term: 'd10' },
  { label: 'd12', term: 'd12' },
  { label: 'd20', term: 'd20' },
  { label: 'd100', term: 'd100' },
  { label: '%', term: 'd{0..100}' },
] as const;

type DiceNode = Extract<Node, { kind: 'dice' }>;
function lastAdditiveDie(node: Node): DiceNode | null {
  if (node.kind === 'interpret') return lastAdditiveDie(node.expression);
  if (node.kind === 'binary' && (node.op === '+' || node.op === '-')) return lastAdditiveDie(node.right);
  return node.kind === 'dice' ? node : null;
}
function dieTerm(node: DiceNode): string {
  return formatShort({ ...node, quantity: { kind: 'literal', value: 1, span: node.quantity.span }, resolution: 'inferred' });
}

/** Append a shortcut, or increment the final matching unmodified die term. */
export function insertDiceShortcut(source: string, term: string): string {
  const trimmed = source.trimEnd();
  if (!trimmed) return term;
  if (['+', '-', '*', '/'].includes(trimmed.at(-1)!)) return `${trimmed} ${term}`;
  try {
    const ast = parseAuto(source).ast;
    const final = lastAdditiveDie(ast);
    const shortcut = parseAuto(term).ast;
    if (final && shortcut.kind === 'dice' && final.resolution === 'inferred' && !final.reroll
        && final.quantity.kind === 'literal' && Number.isInteger(final.quantity.value)
        && dieTerm(final) === dieTerm(shortcut)) {
      const replacement = `${final.quantity.value + 1}${dieTerm(final)}`;
      return source.slice(0, final.span.start) + replacement + source.slice(final.span.end);
    }
    const end = ast.kind === 'interpret' ? ast.expression.span.end : trimmed.length;
    return `${source.slice(0, end).trimEnd()} + ${term}${source.slice(end)}`;
  } catch {
    return `${trimmed} + ${term}`;
  }
}
