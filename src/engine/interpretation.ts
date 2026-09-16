import { ExpressionError, type Diagnostic, type InterpretationCondition, type InterpretationRule } from './ast';

function fail(message: string, code: string, start: number, end: number, incomplete = false): never {
  const diagnostic: Diagnostic = { severity: 'error', code, message, start, end };
  throw new ExpressionError(`${message} at position ${start + 1}`, incomplete, diagnostic);
}

function numeric(text: string, start: number): number {
  let index = 0;
  if (text[index] === '+' || text[index] === '-') index++;
  let digits = 0;
  while (text[index] >= '0' && text[index] <= '9') { index++; digits++; }
  if (text[index] === '.') {
    index++;
    while (text[index] >= '0' && text[index] <= '9') { index++; digits++; }
  }
  if (!digits || index !== text.length) fail('Expected a numeric boundary', 'INVALID_INTERPRETATION_BOUNDARY', start, start + text.length);
  const value = Number(text);
  if (!Number.isFinite(value)) fail('Interpretation boundary must be finite', 'INVALID_INTERPRETATION_BOUNDARY', start, start + text.length);
  return value;
}

export function parseInterpretationCondition(raw: string, start = 0): InterpretationCondition {
  const text = raw.trim();
  const offset = start + raw.indexOf(text);
  if (!text) fail('Expected an interpretation condition', 'EMPTY_INTERPRETATION_CONDITION', start, start + raw.length);
  for (const operator of ['<=', '>=', '<', '>'] as const) {
    if (text.startsWith(operator)) return { kind: 'comparison', operator, threshold: numeric(text.slice(operator.length).trim(), offset + operator.length) };
  }
  if (text.endsWith('+')) return { kind: 'comparison', operator: '>=', threshold: numeric(text.slice(0, -1).trim(), offset) };
  // The first sign belongs to a negative lower bound; a later dash is the range separator.
  const separator = text.indexOf('-', text[0] === '-' || text[0] === '+' ? 1 : 0);
  if (separator >= 0) {
    const first = numeric(text.slice(0, separator).trim(), offset);
    if (separator === text.length - 1) return { kind: 'comparison', operator: '<=', threshold: first };
    const second = numeric(text.slice(separator + 1).trim(), offset + separator + 1);
    if (first > second) fail('Interpretation range must run from low to high', 'INVALID_INTERPRETATION_RANGE', offset, offset + text.length);
    return { kind: 'range', minimum: first, maximum: second };
  }
  return { kind: 'exact', value: numeric(text, offset) };
}

export function parseInterpretationTable(source: string, offset = 0): InterpretationRule[] {
  const rules: InterpretationRule[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
    if (cursor >= source.length) break;
    if (source[cursor] === ';') fail('Expected a rule before semicolon', 'EMPTY_INTERPRETATION_RULE', offset + cursor, offset + cursor + 1);
    const start = cursor;
    const colon = source.indexOf(':', cursor);
    const semicolon = source.indexOf(';', cursor);
    if (colon < 0 || (semicolon >= 0 && semicolon < colon)) fail("Expected ':' after interpretation condition", 'INTERPRETATION_COLON', offset + start, offset + (semicolon >= 0 ? semicolon : source.length), colon < 0);
    const condition = parseInterpretationCondition(source.slice(start, colon), offset + start);
    const end = source.indexOf(';', colon + 1);
    const labelEnd = end < 0 ? source.length : end;
    const label = source.slice(colon + 1, labelEnd).trim();
    if (!label) fail('Expected interpretation text', 'EMPTY_INTERPRETATION_LABEL', offset + colon + 1, offset + labelEnd, end < 0);
    rules.push({ condition, label, span: { start: offset + start, end: offset + labelEnd } });
    cursor = labelEnd + 1;
  }
  if (!rules.length) fail('Expected an interpretation table after |', 'EMPTY_INTERPRETATION_TABLE', offset, offset + source.length, true);
  return rules;
}

export function matchesInterpretation(condition: InterpretationCondition, value: number): boolean {
  switch (condition.kind) {
    case 'exact': return value === condition.value;
    case 'range': return value >= condition.minimum && value <= condition.maximum;
    case 'comparison': return condition.operator === '<' ? value < condition.threshold : condition.operator === '<=' ? value <= condition.threshold : condition.operator === '>' ? value > condition.threshold : value >= condition.threshold;
  }
}

export function formatInterpretationCondition(condition: InterpretationCondition): string {
  return condition.kind === 'exact' ? String(condition.value) : condition.kind === 'range' ? `${condition.minimum}-${condition.maximum}` : `${condition.operator}${condition.threshold}`;
}
