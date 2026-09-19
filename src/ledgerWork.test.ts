import { describe, expect, it } from 'vitest';
import { parse } from './engine/parser';
import { roll } from './engine/evaluate';
import { ledgerWorkRows } from './ledgerWork';
import type { RollResult } from './protocol';

const fixed = (...values: number[]) => { let index = 0; return { integer: () => values[index++] }; };
const record = (expression: string, draws: number[]): RollResult => {
  const outcome = roll(parse(expression), fixed(...draws));
  return { version: 1, requestId: expression, expression, dialect: 'nodice', visibility: 'everyone', playerId: 'p', playerName: 'Player', value: outcome.value, trace: outcome.trace, steps: outcome.stages, stepDice: outcome.stageDice, stepDrawIndices:outcome.stageDrawIndices,resolution:{ast:parse(expression),dice:outcome.dice??[]}, time: 1 };
};

describe('three-column ledger work', () => {
  it('labels dice reductions and leaves arithmetic reductions unlabeled', () => {
    expect(ledgerWorkRows(record('2d6+d4', [2, 3, 1]))).toEqual([
      { die: '', expression: '2d6+d4' },
      { die: '2d6 →', drawIndices:[0,1], expression: '[3, 4] + d4' },
      { die: '', expression: '7 + d4' },
      { die: 'd4 →', drawIndices:[2], expression: '7 + [2]' },
      { die: '', expression: '7 + 2' },
    ]);
  });
  it('does not repeat a final scalar or pool result', () => {
    expect(ledgerWorkRows(record('d6', [2]))).toEqual([
      { die: '', expression: 'd6' },
      { die: 'd6 →', drawIndices:[0], expression: '[3]' },
    ]);
    expect(ledgerWorkRows(record('p2d6', [1, 2]))).toEqual([{ die: '', expression: 'p2d6' }]);
  });
  it('labels selected custom facets as they resolve', () => {
    const rows = ledgerWorkRows(record('(d2)d{d4,d6,d8,d10,d12,d20}', [1, 2, 0, 4, 2]));
    expect(rows.map(row => row.die)).toEqual(['', 'd2 →', '(d2)d{d4,d6,d8,d10,d12,d20} →', 'd8 →', 'd4 →']);
    expect(rows.at(-1)?.expression).toBe('[5, 3]');
  });
  it('keeps legacy history readable when stage labels were not stored', () => {
    const old = record('d6+1', [2]);
    delete old.stepDice;
    expect(ledgerWorkRows(old).every(row => row.die === '')).toBe(true);
  });
  it('carries structured draw indices onto the die reduction stage', () => {
    const roll=record('2d20',[0,19]);
    roll.stepDrawIndices=[[],[0,1],[]];
    expect(ledgerWorkRows(roll)[1].drawIndices).toEqual([0,1]);
  });
  it('labels the die and both draws when a selector reduces its source', () => {
    const rows=ledgerWorkRows(record('H[2d20]',[6,8]));
    expect(rows.find(row=>row.expression==='H[7,9]')).toMatchObject({die:'2d20 →',drawIndices:[0,1]});
  });
  it('keeps every exploding draw and the final total as separate work rows', () => {
    const rows=ledgerWorkRows(record('d6!',[5,5,4]));
    expect(rows.map(row=>[row.die,row.expression,row.drawIndices])).toEqual([
      ['','d6!',undefined],['d6 →','[6!]',[0]],['','6 + d6!',undefined],
      ['d6 →','6 + [6!]',[1]],['','6 + 6 + d6!',undefined],
      ['d6 →','6 + 6 + [5]',[2]],['','6 + 6 + 5',undefined],['','17',undefined],
    ]);
  });
});
