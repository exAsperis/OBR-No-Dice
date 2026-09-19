import { describe, expect, it } from 'vitest';
import { nextRevealCount, REVEAL_LINE_INTERVAL_MS, reductionDiff, revealLineExploded, revealLines } from './revealLines';
import type { RollResult } from './protocol';
import { parse } from './engine/parser';
import { roll } from './engine/evaluate';

const base: RollResult = { version: 1, requestId: 'a', expression: 'highest 1 of [2d6]', dialect: 'nodice', visibility: 'everyone', playerId: 'p', playerName: 'Bryan', value: 6, trace: ['2d6 → [3, 6]', 'keep highest → 6'], time: 1 };
describe('roll reveal lines', () => {
  it('starts with canonical short form and ends with the full result', () => {
    const lines = revealLines({ ...base, value: 'A very long final result '.repeat(8) });
    expect(lines[0].text).toBe('H[2d6]');
    expect(lines.at(-1)).toEqual({ text: `RESULT: ${'A very long final result '.repeat(8)}`, final: true });
  });
  it('truncates work but retains all stages', () => {
    const lines = revealLines({ ...base, trace: ['x'.repeat(150), 'sum → 6'] });
    expect(lines).toHaveLength(4);
    expect(lines[1].text.length).toBe(100);
    expect(lines[2].text).toBe('sum → 6');
  });
  it('prefers expression reductions over receipt lines', () => {
    const lines = revealLines({ ...base, steps: ['H[2d6]', 'H[3,6]', '[6]'] });
    expect(lines.map(line => line.text)).toEqual(['H[2d6]', 'H[3,6]', '[6]', 'RESULT: 6']);
  });
  it('prints numeric results alongside literal interpretations', () => {
    const lines = revealLines({ ...base, expression:'2d6 | 6-:Fail; 7+:Success', steps:['2d6','[3,3]','6'], interpretation:'Fail' });
    expect(lines.map(line=>line.text)).toEqual(['2d6','[3,3]','6','RESULT: 6 · Fail']);
  });
  it('uses an expression name for the result heading', () => {
    expect(revealLines({ ...base, expression: '2d6 # Attack' }).at(-1)?.text).toBe('Attack: 6');
  });
  it('advances exactly one line per one-second timer tick', () => {
    expect(REVEAL_LINE_INTERVAL_MS).toBe(700);
    expect([1,2,3].map(count=>nextRevealCount(count,3))).toEqual([2,3,3]);
  });
  it('isolates changing terms while retaining surrounding expression text', () => {
    expect(reductionDiff('2d6+2','[6, 5] + 2')).toEqual({prefix:'',removed:'2d6+',added:'[6, 5] + ',suffix:'2'});
    expect(reductionDiff('[2, 3] + 2','5 + 2')).toEqual({prefix:'',removed:'[2, 3]',added:'5',suffix:' + 2'});
    expect(reductionDiff('H(d4)[4d6]+2','H3[2,5,6,1]+2')).toEqual({prefix:'H',removed:'(d4)[4d6',added:'3[2,5,6,1',suffix:']+2'});
  });
  it('reveals source dice and draw badges on the same timed selector step', () => {
    let index=0;
    const outcome=roll(parse('H[2d20]'),{integer:()=>[6,8][index++]});
    const lines=revealLines({...base,expression:'H[2d20]',steps:outcome.stages,stepDice:outcome.stageDice,stepDrawIndices:outcome.stageDrawIndices});
    expect(lines.find(line=>line.text==='H[7,9]')).toMatchObject({die:'2d20 →',drawIndices:[0,1],final:false});
  });
  it('identifies only a work frame whose draw triggered an explosion', () => {
    const ast=parse('d6!');
    const result={...base,resolution:{ast,dice:[{die:'d6!',dieIndex:0,face:6,kind:'initial',exploded:true},{die:'d6!',dieIndex:0,face:4,kind:'explosion'}]}} as RollResult;
    expect(revealLineExploded({text:'[6!]',final:false,drawIndices:[0]},result)).toBe(true);
    expect(revealLineExploded({text:'6 + [4]',final:false,drawIndices:[1]},result)).toBe(false);
  });
});
