import { ExpressionError, type Dialect, type Facet, type Node } from './ast';

class Parser {
  private pos = 0;
  constructor(private source: string, private dialect: Dialect) {}
  private ws() { while (/\s/.test(this.source[this.pos] ?? '')) this.pos++; }
  private peek() { this.ws(); return this.source[this.pos] ?? ''; }
  private take(s: string) { this.ws(); if (this.source.slice(this.pos, this.pos + s.length).toLowerCase() === s.toLowerCase()) { this.pos += s.length; return true; } return false; }
  private fail(message: string): never { throw new ExpressionError(`${message} at position ${this.pos + 1}`, this.pos >= this.source.length); }
  parse(): Node { const node = this.expr(); if (this.peek()) this.fail(`Unexpected '${this.peek()}'`); return node; }
  private expr(): Node { let node = this.term(); while (true) { const c = this.peek(); if (c !== '+' && c !== '-') break; this.pos++; node = { kind: 'binary', op: c, left: node, right: this.term() }; } return node; }
  private term(): Node { let node = this.factor(); while (true) { const c = this.peek(); if (c !== '*' && c !== '/') break; this.pos++; node = { kind: 'binary', op: c, left: node, right: this.factor() }; } return node; }
  private factor(): Node {
    if (this.take('-')) return { kind: 'unary', op: '-', value: this.factor() };
    if (this.take('+')) return this.factor();
    if (this.dialect === 'nodice') {
      const match = /^(DH|DL|H|L)(\d*)\s*\[/i.exec(this.source.slice(this.pos));
      if (match) { this.pos += match[0].length; const value = this.expr(); if (!this.take(']')) this.fail("Expected ']'"); return { kind: 'keep', mode: match[1].toUpperCase() as 'H'|'L'|'DH'|'DL', count: { kind: 'literal', value: Number(match[2] || 1) }, value }; }
      if (/^(pool|sum|p|s)\s*\(/i.test(this.source.slice(this.pos))) {
        const word = /^(pool|sum|p|s)/i.exec(this.source.slice(this.pos))![0].toLowerCase(); this.pos += word.length; this.take('(');
        const items = [this.expr()]; while (this.take(',')) items.push(this.expr());
        if (!this.take(')')) this.fail("Expected ')'");
        return word === 'pool' || word === 'p' ? { kind: 'pool', items } : { kind: 'sum', value: { kind: 'pool', items } };
      }
    }
    let count: Node | undefined;
    const number = /^\d+(?:\.\d+)?/.exec(this.source.slice(this.pos));
    if (number) { this.pos += number[0].length; count = { kind: 'literal', value: Number(number[0]) }; }
    if (this.take('d')) {
      let facets: Facet[];
      if (this.take('{')) {
        facets = []; let segment = '';
        while (this.pos < this.source.length && this.source[this.pos] !== '}') {
          if (this.source[this.pos] === ',') { facets.push(this.facet(segment)); segment = ''; } else segment += this.source[this.pos]; this.pos++;
        }
        facets.push(this.facet(segment)); if (!this.take('}')) this.fail("Expected '}'");
      } else {
        const sides = /^\d+/.exec(this.source.slice(this.pos)); if (!sides) this.fail('Expected die size');
        this.pos += sides[0].length; const n = Number(sides[0]); if (n < 1 || n > 1000) this.fail('Die size must be 1–1000');
        facets = Array.from({ length: n }, (_, i) => i + 1);
      }
      let node: Node = { kind: 'die', count: count ?? { kind: 'literal', value: 1 }, facets, explode: false };
      if (this.dialect === 'roll20') {
        while (true) {
          const mod = /^(kh|kl|dh|dl)(\d+)/i.exec(this.source.slice(this.pos));
          if (mod) { this.pos += mod[0].length; node = { kind: 'keep', mode: ({ kh:'H', kl:'L', dh:'DH', dl:'DL' } as const)[mod[1].toLowerCase() as 'kh'|'kl'|'dh'|'dl'], count: { kind:'literal', value:Number(mod[2]) }, value: node }; continue; }
          const reroll = /^(ro|r)(<=|>=|<|>|=)?(-?\d+)/i.exec(this.source.slice(this.pos));
          if (reroll) { this.pos += reroll[0].length; if (node.kind !== 'die') this.fail('Reroll must follow a die'); node.reroll={once:reroll[1].toLowerCase()==='ro',comparator:(reroll[2]??'=') as '<'|'<='|'='|'>'|'>=',target:Number(reroll[3])}; continue; }
          if (this.take('!')) { if(node.kind!=='die') this.fail('Explosion must follow a die'); node.explode=true; continue; }
          break;
        }
      }
      else if (this.take('!')) { if (node.kind === 'die') node.explode = true; else this.fail('Explosion must follow a die'); }
      return node;
    }
    if (count) return count;
    if (this.take('(')) { const node = this.expr(); if (!this.take(')')) this.fail("Expected ')'"); return node; }
    this.fail('Expected a number, die, or group');
  }
  private facet(raw: string): Facet { const s = raw.trim(); if (!s) this.fail('Empty die facet'); return /^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : s; }
}
export function parse(source: string, dialect: Dialect = 'nodice'): Node { if (!source.trim()) throw new ExpressionError('Enter an expression', true); return new Parser(source, dialect).parse(); }
