import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { evaluate, roll, type Rng } from './evaluate';
import { distribution } from './probability';

const fixed=(...values:number[]):Rng=>{ let i=0; return {integer:(n)=>values[i++]%n}; };
const pmf=(source:string,dialect:'nodice'|'roll20'='nodice')=>distribution(parse(source,dialect));
const chance=(source:string,value:number|string)=>pmf(source).entries.find(e=>e.value===value)?.probability;
describe('No Dice engine',()=>{
  it('parses ordinary and arbitrary dice',()=>{
    expect(roll(parse('d6'),fixed(5)).value).toBe(6);
    expect(roll(parse('2d{0,1}'),fixed(0,1)).value).toBe(1);
    expect(roll(parse('d{cat,dog,bird}'),fixed(1)).value).toBe('dog');
    expect(roll(parse('d{-2,-1,0,1,2}'),fixed(0)).value).toBe(-2);
    expect(roll(parse('d{0.5,1,1.5}'),fixed(2)).value).toBe(1.5);
  });
  it('preserves duplicate facets as weights',()=>{expect(chance('d{a,a,b}','a')).toBeCloseTo(2/3);expect(chance('d{1,1,1,2,2,5}',1)).toBeCloseTo(.5);});
  it('applies arithmetic precedence and grouping',()=>{expect(roll(parse('2+3*4')).value).toBe(14);expect(roll(parse('(2+3)*4')).value).toBe(20);expect(roll(parse('2d6+4'),fixed(0,5)).value).toBe(11);});
  it('supports pools, sums and keep/drop',()=>{
    expect(evaluate(parse('pool(d4,d6)'),fixed(1,2)).value).toEqual([2,3]);
    expect(roll(parse('sum(d4,d6)'),fixed(1,2)).value).toBe(5);
    expect(roll(parse('H3[4d6]+2'),fixed(5,3,2,0)).value).toBe(15);
    expect(roll(parse('DL[4d6]'),fixed(5,3,2,0)).value).toBe(13);
    expect(roll(parse('H[d{Miss,Hit,Crit}]'),fixed(2)).value).toBe('Crit');
  });
  it('emits staged traces',()=>{const result=roll(parse('2d20+7'),fixed(16,5));expect(result.trace.join(' ')).toContain('17');expect(result.trace.join(' ')).toContain('6');expect(result.trace.at(-1)).toContain('30');});
  it('reports invalid combinations and incomplete input',()=>{expect(()=>parse('2d')).toThrow();expect(()=>roll(parse('d{Miss,Hit}+2'),fixed(0))).toThrow();expect(()=>parse('H3[2d6')).toThrow();});
  it('computes exact probability mass functions',()=>{
    const d6=pmf('d6');expect(d6.exact).toBe(true);expect(d6.entries).toHaveLength(6);expect(d6.entries.every(e=>Math.abs(e.probability-1/6)<1e-10)).toBe(true);
    expect(chance('2d6',7)).toBeCloseTo(6/36);
    expect(chance('2d{0,1}',0)).toBeCloseTo(.25);expect(chance('2d{0,1}',1)).toBeCloseTo(.5);expect(chance('2d{0,1}',2)).toBeCloseTo(.25);
    expect(chance('2d6+4',11)).toBeCloseTo(6/36);
    expect(pmf('2d6').mean).toBeCloseTo(7);
    expect(pmf('d{Miss,Miss,Hit}').entries.reduce((s,e)=>s+e.probability,0)).toBeCloseTo(1);
  });
  it('adapts Roll20 notation into the same AST',()=>{
    expect(roll(parse('2d20kh1+5','roll20'),fixed(16,5)).value).toBe(22);
    expect(roll(parse('4d6dl1','roll20'),fixed(5,3,2,0)).value).toBe(13);
    expect(roll(parse('3d8+4','roll20'),fixed(0,1,2)).value).toBe(10);
    expect(roll(parse('1d20-2','roll20'),fixed(19)).value).toBe(18);
  });
  it('shows explosions and rerolls',()=>{
    const exploded=roll(parse('d6!','roll20'),fixed(5,5,3));expect(exploded.value).toBe(16);expect(exploded.trace.filter(s=>s.startsWith('explode'))).toHaveLength(2);
    expect(pmf('d6!','roll20').exact).toBe(false);
    expect(roll(parse('d6ro=1','roll20'),fixed(0,4)).value).toBe(5);
  });
  it('rejects guaranteed reroll loops and bounds unlucky rerolls',()=>{
    expect(()=>parse('d1r=1','roll20')).toThrow(/reroll|terminate/i);
    expect(()=>parse('d6r>=1','roll20')).toThrow(/reroll|terminate/i);
    expect(()=>roll(parse('d6r=1','roll20'),{integer:()=>0})).toThrow(/Reroll limit reached/);
  });
});
