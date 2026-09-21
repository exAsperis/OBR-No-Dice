import type { Node } from './engine/ast';
import { formatShort } from './engine/format';
import { interpretationPipe, parseAuto } from './engine/parser';
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
  { label: 'PbtA', term: '2d6 | 6-:Miss;7-9:Partial;10+:Hit' },
  { label: '(8)', term: 'd{It is certain, Reply hazy try again, Do not count on it, It is decidedly so, Ask again later, My reply is no, Without a doubt, Better not tell you now, My sources say no, Yes definitely, Cannot predict now, Outlook not so good, You may rely on it, Concentrate and ask again, Very doubtful, As I see it Yes, Most likely, Outlook good, Yes, Signs point to yes}' }
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

interface ShortcutParts { body: string; rules: string; hasPipe: boolean; name?: string; nameSuffix: string }
function parts(source: string): ShortcutParts {
  const named = splitExpressionName(source);
  const withoutName = named.suffix ? source.slice(0, -named.suffix.length) : source;
  const pipe = interpretationPipe(withoutName);
  return { body: pipe < 0 ? withoutName : withoutName.slice(0, pipe), rules: pipe < 0 ? '' : withoutName.slice(pipe + 1), hasPipe: pipe >= 0, name: named.name, nameSuffix: named.suffix };
}

/** Preserve the existing arithmetic composition and matching-die increment. */
function combineBodies(prefix: string, term: string, preserveTrailing: boolean): string {
  const trimmed = prefix.trimEnd();
  const tail = preserveTrailing ? prefix.slice(trimmed.length) : '';
  const shortcut = term.trimStart();
  if (!shortcut.trim()) return prefix;
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
      return prefix.slice(0, final.span.start) + replacement + prefix.slice(final.span.end);
    }
    return `${trimmed} + ${body}${tail}`;
  } catch {
    return `${trimmed} + ${body}${tail}`;
  }
}

/** Append a shortcut, combining each side's numeric term, interpretation rules, and name. */
export function insertDiceShortcut(source: string, term: string): string {
  const current = parts(source), incoming = parts(term);
  let result = combineBodies(current.body, incoming.body.trimEnd(), current.hasPipe || !!current.nameSuffix);
  if (current.hasPipe && incoming.hasPipe) {
    const left = current.rules.trimEnd(), right = incoming.rules.trim();
    const separator = left.trim() && right ? (left.trimEnd().endsWith(';') ? ' ' : '; ') : '';
    result += `|${left || (right ? ' ' : '')}${separator}${right}`;
  } else if (current.hasPipe) result += `|${current.rules}`;
  else if (incoming.hasPipe) result += `${result && !/\s$/.test(result) ? ' ' : ''}|${incoming.rules}`;

  if (current.name && incoming.name) result = `${result.trimEnd()} # ${current.name} + ${incoming.name}`;
  else if (current.nameSuffix) result += current.nameSuffix;
  else if (incoming.nameSuffix) result += `${result && !/\s$/.test(result) ? ' ' : ''}${incoming.nameSuffix}`;
  return result;
}

/** A click may be relayed more than once when multiple background frames are active. */
export function applyDiceShortcutOnce(source: string, term: string, requestId: string, seen: Set<string>): string | null {
  if (seen.has(requestId)) return null;
  seen.add(requestId);
  if (seen.size > 200) seen.delete(seen.values().next().value!);
  return insertDiceShortcut(source, term);
}
