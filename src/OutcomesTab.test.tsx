import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutcomesTab } from './OutcomesTab';
import { rollExpression } from './rollService';
import { normalizeExpression, type StoredRoll } from './sessionLedger';

function roll(expression:string,player:string,faces:number[],timestamp:number,interpretation?:string):StoredRoll{
  let index=0;
  const result=rollExpression({requestId:crypto.randomUUID(),expression,visibility:'everyone',playerId:player,playerName:player},{integer:max=>(faces[index++]??0)%max}).record;
  result.time=timestamp;
  result.interpretation=interpretation;
  return {id:result.requestId,sessionId:'session',timestamp,rollerId:player,rollerName:player,expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};
}
const value=(label:string)=>within(document.querySelector('.outcomes-summary') as HTMLElement).getByText(label).closest('.stat-card')?.querySelector('strong')?.textContent;
const outcomeTable=()=>screen.getAllByRole('table')[0];

describe('OutcomesTab',()=>{
  it('filters records with the shared expression, result, player, category, and date semantics',()=>{
    const first=roll('d20+5','Joe',[19],new Date('2026-09-19T19:00').getTime(),'Hit');
    const second=roll('d20','Bill',[0],new Date('2026-09-19T19:10').getTime(),'Miss');
    const third=roll('d6','Joe',[5],new Date('2026-09-19T19:20').getTime(),'Hit');
    render(<OutcomesTab rolls={[first,second,third]} roomId="room" viewerId="viewer"/>);
    fireEvent.change(screen.getByLabelText('Expression regex'),{target:{value:'^d20'}});
    expect(screen.getByText('2 of 3 session rolls match the current filters.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Result'),{target:{value:'<='}});
    fireEvent.change(screen.getByLabelText('Result value'),{target:{value:'20'}});
    expect(screen.getByText('1 of 3 session rolls match the current filters.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Category'),{target:{value:'Hit'}});
    expect(screen.getByText('No rolls match the current filters.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));
    fireEvent.click(screen.getByRole('checkbox',{name:'Bill'}));
    expect(screen.getByText('2 of 3 session rolls match the current filters.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('From'),{target:{value:'2026-09-19T19:15'}});
    expect(screen.getByText('1 of 3 session rolls match the current filters.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Until'),{target:{value:'2026-09-19T19:15'}});
    expect(screen.getByText('No rolls match the current filters.')).toBeTruthy();
  });

  it('uses individual die draws for Roll filtering independently of final results',()=>{
    render(<OutcomesTab rolls={[roll('d20+5','Joe',[19],1),roll('d20','Bill',[18],2)]} roomId="room" viewerId="viewer"/>);
    fireEvent.change(screen.getByLabelText('Roll'),{target:{value:'='}});
    fireEvent.change(screen.getByLabelText('Roll value'),{target:{value:'20'}});
    fireEvent.change(screen.getByLabelText('Roll die'),{target:{value:'d20'}});
    expect(screen.getByText('1 of 2 session rolls match the current filters.')).toBeTruthy();
    expect(value('Results')).toBe('1');
    expect(within(outcomeTable()).getByText('25')).toBeTruthy();
  });

  it('summarizes final outcomes, retains symbolic and pool values, ties modes, and scales bars',()=>{
    const rolls=[roll('d6','Joe',[0],1),roll('d6','Joe',[0],2),roll('d6','Bill',[1],3),roll('d6','Bill',[1],4),roll('d{Miss,Hit}','Joe',[0],5),roll('p2d6','Bill',[0,1],6)];
    render(<OutcomesTab rolls={rolls} roomId="room" viewerId="viewer"/>);
    expect(value('Results')).toBe('6');
    expect(value('Distinct outcomes')).toBe('4');
    expect(value('Minimum')).toBe('1');
    expect(value('Maximum')).toBe('2');
    expect(value('Mean')).toBe('1.50');
    expect(value('Median')).toBe('1.50');
    expect(value('Mode')).toContain('1');
    const rows=within(outcomeTable()).getAllByRole('row').slice(1);
    expect(rows.map(row=>within(row).getAllByRole('cell')[0].textContent)).toEqual(['[1, 2]','1','2','Miss']);
    expect(within(outcomeTable()).getByText('Miss')).toBeTruthy();
    expect(within(outcomeTable()).getByText('[1, 2]')).toBeTruthy();
    const bars=outcomeTable().querySelectorAll<HTMLElement>('.outcome-bar');
    expect(bars[1].style.width).toBe('100%');
    expect(bars[0].style.width).toBe('50%');
  });

  it('analyzes one selected die type, includes repeated draws, and keeps Analyze die separate from Roll die',()=>{
    const mixed=roll('d20+d6','Joe',[19,2],1),repeated=roll('d6!2','Bill',[5,0,1],2);
    render(<OutcomesTab rolls={[mixed,repeated]} roomId="room" viewerId="viewer"/>);
    fireEvent.click(screen.getByRole('button',{name:'Dice'}));
    const analyze=screen.getByLabelText('Analyze die type') as HTMLSelectElement;
    fireEvent.change(analyze,{target:{value:'d{1,2,3,4,5,6}'}});
    expect(value('Dice')).toBe('2');
    fireEvent.change(analyze,{target:{value:'d6'}});
    expect(value('Dice')).toBe('1');
    expect(screen.getByLabelText('Roll')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Roll'),{target:{value:'='}});
    fireEvent.change(screen.getByLabelText('Roll value'),{target:{value:'20'}});
    fireEvent.change(screen.getByLabelText('Roll die'),{target:{value:'d20'}});
    expect((screen.getByLabelText('Analyze die type') as HTMLSelectElement).value).toBe('d6');
    expect(value('Dice')).toBe('1');
    expect(within(outcomeTable()).getByText('3')).toBeTruthy();
  });

  it('reports natural extrema with zero distinct from unavailable',()=>{
    const {rerender}=render(<OutcomesTab rolls={[roll('d20','Joe',[9],1)]} roomId="room" viewerId="viewer"/>);
    fireEvent.click(screen.getByRole('button',{name:'Dice'}));
    expect(value('Natural minimums')).toBe('0');
    expect(value('Natural maximums')).toBe('0');
    rerender(<OutcomesTab rolls={[roll('d{Miss,Hit}','Joe',[0],1)]} roomId="room" viewerId="viewer"/>);
    expect(value('Natural minimums')).toBe('—');
    expect(value('Natural maximums')).toBe('—');
  });

  it('shows interpretation frequencies only for Results and uses all matching rolls as denominator',()=>{
    render(<OutcomesTab rolls={[roll('d6','Joe',[0],1,'Miss'),roll('d6','Joe',[1],2),roll('d6','Bill',[2],3,'Hit')]} roomId="room" viewerId="viewer"/>);
    const heading=screen.getByRole('heading',{name:'Interpretation categories'});
    const categoryTable=heading.parentElement!.querySelector('table')!;
    expect(within(categoryTable).getAllByText('33.3%')).toHaveLength(2);
    expect(within(categoryTable).queryByText(/No interpretation/)).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Dice'}));
    expect(screen.queryByRole('heading',{name:'Interpretation categories'})).toBeNull();
  });

  it('validates filters and clearing restores players without switching modes',()=>{
    render(<OutcomesTab rolls={[roll('d6','Joe',[0],1),roll('d6','Bill',[1],2)]} roomId="room" viewerId="viewer"/>);
    fireEvent.change(screen.getByLabelText('Expression regex'),{target:{value:'['}});
    expect(screen.getByRole('alert').textContent).toContain('Invalid regular expression');
    fireEvent.change(screen.getByLabelText('Expression regex'),{target:{value:''}});
    fireEvent.change(screen.getByLabelText('Result'),{target:{value:'='}});
    fireEvent.change(screen.getByLabelText('Result value'),{target:{value:''}});
    expect(screen.getByRole('alert').textContent).toContain('numeric');
    fireEvent.click(screen.getByRole('button',{name:'Dice'}));
    fireEvent.click(screen.getByRole('button',{name:'Clear all'}));
    fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));
    expect(screen.getByRole('button',{name:'Dice'}).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('2 of 2 session rolls match the current filters.')).toBeTruthy();
    expect(screen.getAllByRole('checkbox').every(box=>(box as HTMLInputElement).checked)).toBe(true);
  });
});
