export type Facet = number | string;
export type Dialect = 'nodice' | 'roll20';
export type ResolutionMode = 'inferred' | 'pool' | 'sum';
export type Selector = 'highest' | 'lowest' | 'drop-highest' | 'drop-lowest';
export type Comparator = '<' | '<=' | '=' | '>' | '>=';
export interface Span { start: number; end: number }
export interface Reroll { once: boolean; comparator: Comparator; target: number }
export interface Explosion { limit?: number }
export type InterpretationCondition =
  | { kind: 'comparison'; operator: '<' | '<=' | '>' | '>='; threshold: number }
  | { kind: 'range'; minimum: number; maximum: number }
  | { kind: 'exact'; value: number };
export interface InterpretationRule { condition: InterpretationCondition; label: string; span: Span }
export type TemplateSegment = { kind: 'text'; text: string } | { kind: 'expression'; expression: Node };
export type FacetSpec = (
  | { kind: 'value'; value: Facet }
  | { kind: 'expression'; expression: Node }
  | { kind: 'template'; segments: TemplateSegment[] }
) & { span: Span; explosion?: Explosion; facetReroll?: Explosion };
export type Die = { kind: 'standard-die'; sides: Node; explodeHighest?: Explosion; rerollLowest?: Explosion } | { kind: 'custom-die'; facets: FacetSpec[] };
export type Node = (
  | { kind: 'literal'; value: number }
  | { kind: 'dice'; quantity: Node; die: Die; resolution: ResolutionMode; reroll?: Reroll }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { kind: 'unary'; op: '-'; value: Node }
  | { kind: 'group'; value: Node }
  | { kind: 'pool'; items: Node[] }
  | { kind: 'resolve'; resolution: 'pool' | 'sum'; value: Node }
  | { kind: 'selector'; operator: Selector; count: Node; source: Extract<Node, { kind: 'pool' }> }
  | { kind: 'interpret'; expression: Node; rules: InterpretationRule[] }
) & { span: Span };

export interface Diagnostic extends Span { severity: 'error'; code: string; message: string }
export class ExpressionError extends Error {
  constructor(message: string, public incomplete = false, public diagnostic?: Diagnostic) { super(message); this.name = 'ExpressionError'; }
}
