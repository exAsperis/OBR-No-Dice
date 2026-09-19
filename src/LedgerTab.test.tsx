import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerTab } from './LedgerTab';
import { downloadText } from './sessionExport';
import { normalizeExpression, type DiceSession, type StoredRoll } from './sessionLedger';
import { rollExpression } from './rollService';

const session:DiceSession={id:'session',name:'2026-09-18 19:00',startedAt:1};
vi.mock('./sessionExport',async importOriginal=>({...await importOriginal<typeof import('./sessionExport')>(),downloadText:vi.fn()}));

const roll=(expression:string,playerId:string,faces:number[],time:number,interpretation?:string):StoredRoll=>{
  let index=0;
  const result=rollExpression({requestId:crypto.randomUUID(),expression,visibility:'everyone',playerId,playerName:playerId},{integer:max=>(faces[index++]??0)%max}).record;
  result.time=time;
  result.interpretation=interpretation;
  return {id:result.requestId,sessionId:'session',timestamp:time,rollerId:playerId,rollerName:playerId,expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};
};

beforeEach(()=>vi.mocked(downloadText).mockClear());

describe('LedgerTab',()=>{
  it('renders one chronological row per roll with the raw Ledger columns',()=>{
    const late=roll('d20','Joe',[19],3_000),early=roll('d6','Bill',[0],1_000,'Miss'),middle=roll('d8','Joe',[3],2_000);
    render(<LedgerTab session={session} rolls={[late,early,middle]}/>);
    const table=screen.getByRole('table'),headers=within(table).getAllByRole('columnheader').map(cell=>cell.textContent);
    expect(headers).toEqual(['#','Time','Player','Expression','Result','Interpretation']);
    const rows=within(table).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(rows.slice(1).map(row=>within(row).getAllByRole('cell')[3].textContent)).toEqual(['d6','d8','d20']);
    expect(within(table).queryByRole('columnheader',{name:'Joe'})).toBeNull();
    expect(within(rows[1]).getByText('Miss')).toBeTruthy();
    expect(within(rows[2]).getByText('—')).toBeTruthy();
    expect(within(rows[1]).getByText(/:/).getAttribute('title')).toBe(new Date(early.timestamp).toLocaleString());
  });

  it('preserves chronological session numbering when filters remove earlier rolls',()=>{
    render(<LedgerTab rolls={[roll('d20','Joe',[19],3),roll('d6','Joe',[0],1),roll('d8','Joe',[3],2)]}/>);
    fireEvent.change(screen.getByLabelText('Expression regex'),{target:{value:'^d8$'}});
    expect(screen.getByText('1 of 3 rolls shown.')).toBeTruthy();
    const cells=within(screen.getByRole('table')).getAllByRole('cell');
    expect(cells[0].textContent).toBe('2');
  });

  it('keeps expression, Result, Roll, die-type, and player filters distinct',()=>{
    const rolls=[roll('d20+5','Joe',[19],1),roll('d20','Bill',[0],2),roll('d6','Joe',[5],3)];
    render(<LedgerTab rolls={rolls}/>);
    fireEvent.change(screen.getByLabelText('Expression regex'),{target:{value:'^d20'}});
    fireEvent.change(screen.getByLabelText('Roll'),{target:{value:'='}});
    fireEvent.change(screen.getByLabelText('Roll value'),{target:{value:'20'}});
    fireEvent.change(screen.getByLabelText('Roll die'),{target:{value:'d20'}});
    expect(screen.getByText('1 of 3 rolls shown.')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('Joe')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Result'),{target:{value:'<='}});
    fireEvent.change(screen.getByLabelText('Result value'),{target:{value:'20'}});
    expect(screen.getByText('0 of 3 rolls shown.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Result value'),{target:{value:'25'}});
    fireEvent.click(screen.getByRole('checkbox',{name:'Joe'}));
    expect(screen.getByText('0 of 3 rolls shown.')).toBeTruthy();
  });

  it('applies PbtA and Nat 20 shortcuts as filters',()=>{
    render(<LedgerTab rolls={[roll('2d6+1','Joe',[5,5],1),roll('d20+5','Bill',[19],2),roll('d20','Joe',[0],3)]}/>);
    fireEvent.click(screen.getByRole('button',{name:'PbtA 6-'}));
    expect((screen.getByLabelText('Expression regex') as HTMLInputElement).value).toBe('^2d6(?:[+-]\\d+)?$');
    expect(screen.getByText('0 of 3 rolls shown.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Nat 20'}));
    expect((screen.getByLabelText('Roll') as HTMLSelectElement).value).toBe('=');
    expect((screen.getByLabelText('Roll value') as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('Roll die') as HTMLSelectElement).value).toBe('d20');
    expect(screen.getByText('1 of 3 rolls shown.')).toBeTruthy();
  });

  it('omits the former aggregate and outcome-analysis UI',()=>{
    render(<LedgerTab rolls={[roll('d20','Joe',[19],1)]}/>);
    for(const text of ['Matched rolls / dice','Players / expressions','Average percentile','Natural minimums / maximums','Match rate','Mean shown result','Outcome','Count','Observed %'])expect(screen.queryByText(text)).toBeNull();
    expect(screen.queryByRole('button',{name:'Results'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Dice'})).toBeNull();
    expect(screen.queryByText(/Shared Statistics filters/)).toBeNull();
  });

  it('exports filtered rolls separately from the entire session',()=>{
    const a=roll('d6','Joe',[0],1),b=roll('d20','Bill',[19],2),c=roll('d8','Joe',[2],3);
    render(<LedgerTab rolls={[a,b,c]} session={session}/>);
    fireEvent.change(screen.getByLabelText('Result'),{target:{value:'<='}});
    fireEvent.change(screen.getByLabelText('Result value'),{target:{value:'6'}});
    fireEvent.click(screen.getByText('Export'));
    fireEvent.click(screen.getByRole('button',{name:'CSV · Filtered Ledger'}));
    expect(vi.mocked(downloadText).mock.calls[0][0]).toBe('no-dice-2026-09-18-1900-filtered-ledger.csv');
    expect(vi.mocked(downloadText).mock.calls[0][1]).toContain(',d6,');
    expect(vi.mocked(downloadText).mock.calls[0][1]).toContain(',d8,');
    expect(vi.mocked(downloadText).mock.calls[0][1]).not.toContain(',d20,');
    fireEvent.click(screen.getByRole('button',{name:'CSV · Entire Session'}));
    expect(vi.mocked(downloadText).mock.calls[1][1]).toContain(',d20,');
    fireEvent.click(screen.getByRole('button',{name:'JSON · Entire Session'}));
    expect(JSON.parse(vi.mocked(downloadText).mock.calls[2][1]).rolls).toHaveLength(3);
  });

  it('exports every match when rendering is capped at 500 rows',()=>{
    const template=roll('d6','Joe',[0],1),rolls=Array.from({length:501},(_,index)=>({...template,id:`roll-${index}`,timestamp:index}));
    render(<LedgerTab rolls={rolls} session={session}/>);
    expect(screen.getByText('501 of 501 rolls match. Showing first 500.')).toBeTruthy();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(501);
    fireEvent.click(screen.getByText('Export'));
    fireEvent.click(screen.getByRole('button',{name:'CSV · Filtered Ledger'}));
    expect(vi.mocked(downloadText).mock.calls[0][1].trim().split(/\r?\n/)).toHaveLength(502);
  });
});
