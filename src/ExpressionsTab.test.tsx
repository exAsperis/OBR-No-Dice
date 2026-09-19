import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExpressionsTab } from './ExpressionsTab';
import { rollExpression } from './rollService';
import { normalizeExpression, type StoredRoll } from './sessionLedger';
import type { Dialect } from './engine/ast';

function roll(expression:string,player:string,faces:number[],time:number,dialect:Dialect='nodice'):StoredRoll{
  let index=0;
  const result=rollExpression({requestId:crypto.randomUUID(),expression,dialect,visibility:'everyone',playerId:player,playerName:player},{integer:max=>(faces[index++]??0)%max}).record;
  return {id:result.requestId,sessionId:'session',timestamp:time,rollerId:player,rollerName:player,expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};
}
const summaryValue=(label:string)=>within(document.querySelector('.expression-detail-summary') as HTMLElement).getByText(label).closest('.stat-card')?.querySelector('strong')?.textContent;

describe('ExpressionsTab',()=>{
  it('renders the comparison columns and keeps equal labels in different dialects separate',()=>{
    render(<ExpressionsTab rolls={[roll('d6','Joe',[0],1),roll('d6','Bill',[5],2,'roll20')]} roomId="room" viewerId="viewer"/>);
    expect(screen.getAllByRole('columnheader').map(cell=>cell.textContent)).toEqual(['Expression','Rolls','Players','Observed mean','Expected mean','Δ mean','Observed range','Expected range']);
    const rows=screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows.map(row=>row.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('d6 · No Dice'),expect.stringContaining('d6 · Roll20')]));
  });

  it('selects and deselects rows with click or Enter without filtering the table',()=>{
    render(<ExpressionsTab rolls={[roll('d6','Joe',[0],1),roll('d20','Bill',[9],2)]} roomId="room" viewerId="viewer"/>);
    const table=screen.getByRole('table'),d6=within(table).getByText('d6').closest('tr')!;
    fireEvent.click(d6);
    expect(d6.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading',{name:/d6 · 1 rolls/})).toBeTruthy();
    expect(within(table).getByText('d20')).toBeTruthy();
    fireEvent.keyDown(d6,{key:'Enter'});
    expect(screen.queryByRole('heading',{name:/d6 · 1 rolls/})).toBeNull();
  });

  it('shows exact summaries, signed deltas, first-use player order, and observed versus expected differences',()=>{
    const rolls=[roll('d6','Bill',[5],1),roll('d6','Joe',[5],2),roll('d6','Bill',[0],3)];
    render(<ExpressionsTab rolls={rolls} roomId="room" viewerId="viewer"/>);
    fireEvent.click(within(screen.getByRole('table')).getByText('d6'));
    expect(summaryValue('Rolls')).toBe('3');
    expect(summaryValue('Players')).toBe('2');
    expect(summaryValue('Numeric results')).toBe('3');
    expect(summaryValue('Observed mean')).toBe('4.33');
    expect(summaryValue('Expected mean')).toBe('3.50');
    expect(summaryValue('Δ mean')).toBe('+0.83');
    expect(summaryValue('Observed range')).toBe('1–6');
    expect(summaryValue('Expected range')).toBe('1–6');
    expect(screen.getByText('Exact theoretical distribution available.')).toBeTruthy();
    const players=document.querySelector('.expression-players')!;
    expect(players.textContent?.indexOf('Bill')).toBeLessThan(players.textContent!.indexOf('Joe'));
    expect(players.querySelectorAll('.player-color-disk')).toHaveLength(2);
    const distribution=document.querySelector<HTMLElement>('.expression-distribution')!;
    expect(within(distribution).getByRole('columnheader',{name:'Expected %'})).toBeTruthy();
    expect(within(distribution).getByRole('columnheader',{name:'Difference'})).toBeTruthy();
    expect(within(distribution).getAllByText(/pp$/).length).toBeGreaterThan(0);
  });

  it('keeps observed legacy outcomes in the union when exact theory exists',()=>{
    const legacy=roll('d6','Joe',[0],1);legacy.finalResult=99;legacy.result.value=99;
    render(<ExpressionsTab rolls={[legacy]} roomId="room" viewerId="viewer"/>);
    fireEvent.click(within(screen.getByRole('table')).getByText('d6'));
    const detail=document.querySelector<HTMLElement>('.expression-distribution')!;
    expect(within(detail).getByText('99')).toBeTruthy();
    const row=within(detail).getByText('99').closest('tr')!;
    expect(within(row).getAllByRole('cell').map(cell=>cell.textContent)).toEqual(['99','1','100.0%','','—','—']);
  });

  it('keeps symbolic and pool observations useful without fake theoretical columns',()=>{
    render(<ExpressionsTab rolls={[roll('d{Miss,Hit}','Joe',[0],1),roll('p2d6','Joe',[0,3],2)]} roomId="room" viewerId="viewer"/>);
    const main=screen.getByRole('table');
    fireEvent.click(within(main).getByText('d{Miss,Hit}'));
    expect(summaryValue('Numeric results')).toBe('0');
    expect(summaryValue('Observed mean')).toBe('—');
    expect(screen.getByText('Exact theoretical distribution unavailable for this expression.')).toBeTruthy();
    const distribution=document.querySelector<HTMLElement>('.expression-distribution')!;
    expect(within(distribution).getByText('Miss')).toBeTruthy();
    expect(within(distribution).queryByRole('columnheader',{name:'Expected %'})).toBeNull();
    fireEvent.click(within(main).getByText('p2d6'));
    expect(within(document.querySelector<HTMLElement>('.expression-distribution')!).getByText('[1, 4]')).toBeTruthy();
  });

  it('scales observed bars relative to the most frequent result',()=>{
    render(<ExpressionsTab rolls={[roll('d6','Joe',[0],1),roll('d6','Joe',[0],2),roll('d6','Joe',[1],3)]} roomId="room" viewerId="viewer"/>);
    fireEvent.click(within(screen.getByRole('table')).getByText('d6'));
    const bars=document.querySelectorAll<HTMLElement>('.expression-distribution .outcome-bar');
    expect(bars[0].style.width).toBe('100%');
    expect(bars[1].style.width).toBe('50%');
  });
});
