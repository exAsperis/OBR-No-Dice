export type Facet = number | string;
export type Node =
  | { kind: 'literal'; value: number }
  | { kind: 'die'; count: Node; facets: Facet[]; explode: boolean; reroll?: { once: boolean; comparator: '<' | '<=' | '=' | '>' | '>='; target: number } }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { kind: 'unary'; op: '-'; value: Node }
  | { kind: 'pool'; items: Node[] }
  | { kind: 'sum'; value: Node }
  | { kind: 'keep'; mode: 'H' | 'L' | 'DH' | 'DL'; count: Node; value: Node };

export type Dialect = 'nodice' | 'roll20';
export class ExpressionError extends Error {
  constructor(message: string, public incomplete = false) { super(message); this.name = 'ExpressionError'; }
}
