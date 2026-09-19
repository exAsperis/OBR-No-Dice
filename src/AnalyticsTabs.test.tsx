import { render, screen, within } from '@testing-library/react';
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
const renderTab=(tab:AnalyticsTab)=>render(<AnalyticsTabs tab={tab} rolls={rolls} session={undefined} sessionName="Test Session" roomId="" viewerId=""/>);

describe('AnalyticsTabs',()=>{
  it('keeps the session summary while omitting removed Overview sections',()=>{
    renderTab('overview');
    expect(screen.getByRole('heading',{name:'Test Session'})).toBeTruthy();
    expect(screen.getByText('rolls').previousElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Most active roller',{exact:false})).toBeTruthy();
    expect(screen.queryByText('Highest and lowest final results')).toBeNull();
    expect(screen.queryByText(/Hot and cold dice/)).toBeNull();
  });

  it('renders the Players comparison with players as columns',()=>{
    renderTab('players');
    expect(screen.getByRole('columnheader',{name:'Alice'})).toBeTruthy();
    expect(screen.getByRole('columnheader',{name:'Bob'})).toBeTruthy();
    expect(screen.getByRole('rowheader',{name:'Rolls'})).toBeTruthy();
    expect(screen.queryByText('Selected player')).toBeNull();
  });

  it('renders the extracted Expressions comparison',()=>{
    renderTab('expressions');
    const table=screen.getByRole('table');
    expect(within(table).getByRole('columnheader',{name:'Players'})).toBeTruthy();
    expect(within(table).getByRole('columnheader',{name:'Δ mean'})).toBeTruthy();
  });

  it('renders the extracted Outcomes analysis',()=>{
    renderTab('outcomes');
    expect(screen.getByRole('heading',{name:'Outcomes'})).toBeTruthy();
    expect(screen.getByLabelText('Expression regex')).toBeTruthy();
    expect(screen.getByText('2 of 2 session rolls match the current filters.')).toBeTruthy();
  });

  it('renders the extracted Highlights summary',()=>{
    renderTab('highlights');
    expect(screen.getByRole('heading',{name:'Highlights'})).toBeTruthy();
    expect(screen.getByText('⬆ Highest normalized result')).toBeTruthy();
  });
});
