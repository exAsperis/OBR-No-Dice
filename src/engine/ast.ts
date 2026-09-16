export type Facet = number | string;
export type Dialect = 'nodice' | 'roll20';
export type ResolutionMode = 'inferred' | 'pool' | 'sum';
export type Selector = 'highest' | 'lowest' | 'drop-highest' | 'drop-lowest';
export type Comparator = '<' | '<=' | '=' | '>' | '>=';
export interface Span { start: number; end: number }
export interface Reroll { once: boolean; comparator: Comparator; target: number }
export type Die = { kind: 'standard-die'; sides: Node } | { kind: 'custom-die'; facets: Facet[] };
export type Node = (
  | { kind: 'literal'; value: number }
  | { kind: 'dice'; quantity: Node; die: Die; resolution: ResolutionMode; explode: boolean; reroll?: Reroll }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { kind: 'unary'; op: '-'; value: Node }
  | { kind: 'group'; value: Node }
  | { kind: 'pool'; items: Node[] }
  | { kind: 'resolve'; resolution: 'pool' | 'sum'; value: Node }
  | { kind: 'selector'; operator: Selector; count: Node; source: Extract<Node, { kind: 'pool' }> }
) & { span: Span };

export interface Diagnostic extends Span { severity: 'error'; code: string; message: string }
export class ExpressionError extends Error {
  constructor(message: string, public incomplete = false, public diagnostic?: Diagnostic) { super(message); this.name = 'ExpressionError'; }
}
