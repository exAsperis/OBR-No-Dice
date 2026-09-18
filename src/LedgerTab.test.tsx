import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LedgerTab } from './LedgerTab';
import { downloadText } from './sessionExport';
import { normalizeExpression, type DiceSession, type StoredRoll } from './sessionLedger';
import { rollExpression } from './rollService';
const session:DiceSession={id:'session',name:'2026-09-18 19:00',startedAt:1};
vi.mock('./sessionExport',async importOriginal=>({...await importOriginal<typeof import('./sessionExport')>(),downloadText:vi.fn()}));

const roll=(expression:string,playerId:string,faces:number[],time:number):StoredRoll=>{
  let index=0;
  const result=rollExpression({requestId:crypto.randomUUID(),expression,visibility:'everyone',playerId,playerName:playerId},{integer:max=>(faces[index++]??0)%max}).record;
  result.time=time;
  return {id:result.requestId,sessionId:'session',timestamp:time,rollerId:playerId,rollerName:playerId,expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};
};
it('shows selected players as columns and filters chronological rows by final result',()=>{
  render(<LedgerTab session={session} sessionRolls={[]} rolls={[roll('2d6 # First','Joe',[0,2],1),roll('2d6+1','Bill',[3,3],2),roll('d20','Joe',[19],3)]}/>);
  fireEvent.change(screen.getByLabelText('Expression regex'),{target:{value:'^2d6(?:[+-]\\d+)?$'}});
  fireEvent.change(screen.getByLabelText('Result'),{target:{value:'<='}});
  fireEvent.change(screen.getByLabelText('Result value'),{target:{value:'6'}});
  expect(screen.getByText(/1 of 2 expression-matched rolls shown/)).toBeTruthy();
  const table=screen.getAllByRole('table').at(-1)!;
  expect(within(table).getByRole('columnheader',{name:'Joe'})).toBeTruthy();
  expect(within(table).getByRole('columnheader',{name:'Bill'})).toBeTruthy();
  expect(within(table).getAllByRole('row')).toHaveLength(6); // header, one result, four summary rows
  fireEvent.click(screen.getByRole('checkbox',{name:'Bill'}));
  expect(within(table).queryByRole('columnheader',{name:'Bill'})).toBeNull();
});
it('applies Roll criteria to individual die faces while Result remains independent',()=>{
  render(<LedgerTab session={session} sessionRolls={[]} rolls={[roll('d20+5','Joe',[19],1),roll('d6','Bill',[5],2)]}/>);
  fireEvent.change(screen.getByLabelText('Roll'),{target:{value:'>='}});
  fireEvent.change(screen.getByLabelText('Roll value'),{target:{value:'20'}});
  expect(screen.getByText(/1 of 2 expression-matched rolls shown/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Result'),{target:{value:'<='}});
  fireEvent.change(screen.getByLabelText('Result value'),{target:{value:'20'}});
  expect(screen.getByText(/0 of 2 expression-matched rolls shown/)).toBeTruthy();
});
it('applies PbtA and Nat 20 shortcuts to the visible controls',()=>{
  render(<LedgerTab session={session} sessionRolls={[]} rolls={[roll('2d6+1','Joe',[5,5],1),roll('d20+5','Bill',[19],2),roll('d20','Joe',[0],3)]}/>);
  fireEvent.click(screen.getByRole('button',{name:'PbtA 6-'}));
  expect((screen.getByLabelText('Expression regex') as HTMLInputElement).value).toBe('^2d6(?:[+-]\\d+)?$');
  expect(screen.getByText(/0 of 1 expression-matched rolls shown/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Nat 20'}));
  expect((screen.getByLabelText('Roll') as HTMLSelectElement).value).toBe('=');
  expect((screen.getByLabelText('Roll value') as HTMLInputElement).value).toBe('20');
  expect((screen.getByLabelText('Roll die') as HTMLSelectElement).value).toBe('d20');
  expect(screen.getByText(/1 of 3 expression-matched rolls shown/)).toBeTruthy();
});
it('exports matched results and the entire unfiltered session separately',()=>{
  vi.mocked(downloadText).mockClear();
  const a=roll('d6','Joe',[0],1),b=roll('d20','Bill',[19],2),c=roll('d8','Joe',[2],3);
  render(<LedgerTab rolls={[a,b]} sessionRolls={[a,b,c]} session={session}/>);
  fireEvent.change(screen.getByLabelText('Result'),{target:{value:'<='}});
  fireEvent.change(screen.getByLabelText('Result value'),{target:{value:'6'}});
  fireEvent.click(screen.getByText('Export'));
  fireEvent.click(screen.getByRole('button',{name:'CSV · Current Results'}));
  expect(vi.mocked(downloadText).mock.calls[0][0]).toBe('no-dice-2026-09-18-1900-results.csv');
  expect(vi.mocked(downloadText).mock.calls[0][1]).toContain(',d6,');
  expect(vi.mocked(downloadText).mock.calls[0][1]).not.toContain(',d20,');
  fireEvent.click(screen.getByRole('button',{name:'CSV · Entire Session'}));
  expect(vi.mocked(downloadText).mock.calls[1][1]).toContain(',d8,');
  fireEvent.click(screen.getByRole('button',{name:'JSON · Entire Session'}));
  expect(JSON.parse(vi.mocked(downloadText).mock.calls[2][1]).rolls).toHaveLength(3);
});
