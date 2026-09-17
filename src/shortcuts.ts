import type { Node } from './engine/ast';
import { formatShort } from './engine/format';
import { parseAuto } from './engine/parser';
import { splitExpressionName } from './expressionName';

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
  const named = splitExpressionName(source);
  const bodySource = named.suffix ? source.slice(0, -named.suffix.length) : source;
  const pipe = bodySource.indexOf('|');
  const prefix = pipe < 0 ? bodySource : bodySource.slice(0, pipe);
  const suffix = (pipe < 0 ? '' : bodySource.slice(pipe)) + named.suffix;
  const trimmed = prefix.trimEnd();
  const tail = pipe < 0 ? '' : prefix.slice(trimmed.length) + suffix;
  const shortcut = term.trimStart();
  const leadingOperator = /^[+\-*/]/.test(shortcut) ? shortcut[0] : null;
  const body = leadingOperator ? shortcut.slice(1).trimStart() : shortcut;
  const trailingOperator = /[+\-*/]$/.test(trimmed);
  if (!trimmed) return `${shortcut}${tail}`;
  if (leadingOperator) {
    const left = (trailingOperator ? trimmed.slice(0, -1) : trimmed).trimEnd();
    return `${left} ${leadingOperator} ${body}${tail}`;
  }
  if (trailingOperator) return `${trimmed} ${body}${tail}`;
  try {
    const ast = parseAuto(prefix).ast;
    const final = lastAdditiveDie(ast);
    const shortcutAst = parseAuto(body).ast;
    if (final && shortcutAst.kind === 'dice' && final.resolution === 'inferred' && !final.reroll
        && final.quantity.kind === 'literal' && Number.isInteger(final.quantity.value)
        && dieTerm(final) === dieTerm(shortcutAst)) {
      const replacement = `${final.quantity.value + 1}${dieTerm(final)}`;
      return prefix.slice(0, final.span.start) + replacement + prefix.slice(final.span.end) + suffix;
    }
    return `${trimmed} + ${body}${tail}`;
  } catch {
    return `${trimmed} + ${body}${tail}`;
  }
}

/** A click may be relayed more than once when multiple background frames are active. */
export function applyDiceShortcutOnce(source: string, term: string, requestId: string, seen: Set<string>): string | null {
  if (seen.has(requestId)) return null;
  seen.add(requestId);
  if (seen.size > 200) seen.delete(seen.values().next().value!);
  return insertDiceShortcut(source, term);
}
