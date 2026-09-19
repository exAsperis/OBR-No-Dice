import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalyticsTabs, type AnalyticsTab } from './AnalyticsTabs';
import { rollExpression } from './rollService';
import { normalizeExpression, type StoredRoll } from './sessionLedger';

let id=0;
function roll(expression:string,playerId:string,face:number,time:number):StoredRoll{
  const result=rollExpression({requestId:`analytics-tab-${++id}`,expression,visibility:'everyone',playerId,playerName:playerId},{integer:max=>(face-1)%max}).record;
  return {id:result.requestId,sessionId:'session',timestamp:time,rollerId:playerId,rollerName:playerId,expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};
}

const rolls=[roll('d6','Alice',4,1),roll('d20','Bob',12,2)];
const renderTab=(tab:AnalyticsTab)=>render(<AnalyticsTabs tab={tab} rolls={rolls} sessionRolls={rolls} session={undefined} sessionName="Test Session" roomId="" viewerId=""/>);

describe('AnalyticsTabs',()=>{
  it('keeps the session summary while omitting removed Overview sections',()=>{
    renderTab('overview');
    expect(screen.getByRole('heading',{name:'Test Session'})).toBeTruthy();
    expect(screen.getByText('rolls').previousElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Most active roller',{exact:false})).toBeTruthy();
    expect(screen.queryByText('Highest and lowest final results')).toBeNull();
    expect(screen.queryByText(/Hot and cold dice/)).toBeNull();
  });

  it('selects a player for local detail without removing other player rows',()=>{
    renderTab('players');
    const table=screen.getByRole('table');
    fireEvent.click(within(table).getByText('Alice').closest('tr')!);
    expect(screen.getByText('Selected player')).toBeTruthy();
    expect(within(table).getByText('Alice')).toBeTruthy();
    expect(within(table).getByText('Bob')).toBeTruthy();
  });

  it('selects an expression for local detail without removing other expression rows',()=>{
    renderTab('expressions');
    const table=screen.getByRole('table');
    fireEvent.click(within(table).getByText('d6').closest('tr')!);
    expect(screen.getByRole('heading',{name:/d6 · 1 rolls/})).toBeTruthy();
    expect(within(table).getByText('d6')).toBeTruthy();
    expect(within(table).getByText('d20')).toBeTruthy();
  });
});
