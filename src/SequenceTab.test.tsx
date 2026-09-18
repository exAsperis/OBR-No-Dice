import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SequenceTab } from './SequenceTab';
import { normalizeExpression, type StoredRoll } from './sessionLedger';
import { rollExpression } from './rollService';

const roll=(expression:string,playerId:string,faces:number[],time:number):StoredRoll=>{
  let index=0;
  const result=rollExpression({requestId:crypto.randomUUID(),expression,visibility:'everyone',playerId,playerName:playerId},{integer:max=>(faces[index++]??0)%max}).record;
  result.time=time;
  return {id:result.requestId,sessionId:'session',timestamp:time,rollerId:playerId,rollerName:playerId,expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};
};
it('shows selected players as columns and filters chronological rows by final result',()=>{
  render(<SequenceTab rolls={[roll('2d6 # First','Joe',[0,2],1),roll('2d6+1','Bill',[3,3],2),roll('d20','Joe',[19],3)]}/>);
  fireEvent.change(screen.getByLabelText('Expression regex'),{target:{value:'^2d6(?:[+-]\\d+)?$'}});
  fireEvent.change(screen.getByLabelText('Result'),{target:{value:'<='}});
  fireEvent.change(screen.getByLabelText('Value'),{target:{value:'6'}});
  expect(screen.getByText(/1 of 2 expression-matched rolls shown/)).toBeTruthy();
  const table=screen.getAllByRole('table').at(-1)!;
  expect(within(table).getByRole('columnheader',{name:'Joe'})).toBeTruthy();
  expect(within(table).getByRole('columnheader',{name:'Bill'})).toBeTruthy();
  expect(within(table).getAllByRole('row')).toHaveLength(6); // header, one result, four summary rows
  fireEvent.click(screen.getByRole('checkbox',{name:'Bill'}));
  expect(within(table).queryByRole('columnheader',{name:'Bill'})).toBeNull();
});
it('applies numeric query criteria to die faces in Dice mode',()=>{
  render(<SequenceTab rolls={[roll('d20','Joe',[19],1),roll('d6','Bill',[5],2)]}/>);
  fireEvent.click(screen.getByRole('button',{name:'Dice'}));
  fireEvent.change(screen.getByLabelText('Die face'),{target:{value:'>='}});
  fireEvent.change(screen.getByLabelText('Value'),{target:{value:'20'}});
  expect(screen.getByText(/1 of 2 expression-matched rolls shown/)).toBeTruthy();
});
