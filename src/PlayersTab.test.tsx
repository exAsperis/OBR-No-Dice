import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayersTab } from './PlayersTab';
import { savePlayerStatistics, type SavedPlayerStatistic } from './playerStatistics';
import { normalizeExpression, type StoredRoll } from './sessionLedger';
import { rollExpression } from './rollService';

let id=0;
const roll=(expression:string,player:string,faces:number[],time=0):StoredRoll=>{let index=0;const result=rollExpression({requestId:`players-${++id}`,expression,visibility:'everyone',playerId:player,playerName:player},{integer:max=>(faces[index++]??0)%max}).record;return {id:result.requestId,sessionId:'s',timestamp:time,rollerId:player,rollerName:player,expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};};
const saved=(id:string,name:string,aggregate:SavedPlayerStatistic['aggregate'],extra:Partial<SavedPlayerStatistic>={}):SavedPlayerStatistic=>({id,name,aggregate,pattern:'',resultComparison:'any',resultValue:6,rollComparison:'any',rollValue:20,rollDie:'',category:'',from:'',until:'',...extra});
beforeEach(()=>localStorage.clear());

describe('PlayersTab',()=>{
  it('transposes players into colored headers with the six built-in rows',()=>{
    render(<PlayersTab rolls={[roll('d6','Joe',[0],1),roll('d20','Bill',[19],2)]} roomId="room" viewerId="viewer"/>);
    for(const player of ['Joe','Bill']){const header=screen.getByRole('columnheader',{name:player});expect(header.querySelector('.player-color-disk')).toBeTruthy();}
    for(const label of ['Rolls','Dice','Expressions used','Average percentile','First roll','Last roll'])expect(screen.getByRole('rowheader',{name:label})).toBeTruthy();
    expect(screen.queryByRole('rowheader',{name:'Joe'})).toBeNull();
  });

  it('compares Count filters, including individual modified d20 draws',()=>{
    savePlayerStatistics('viewer',[saved('miss','PbtA misses','count',{pattern:'^2d6(?:[+-]\\d+)?$',resultComparison:'<=',resultValue:6}),saved('nat','Nat 20s','count',{rollComparison:'=',rollValue:20,rollDie:'d20'})]);
    const rolls=[roll('2d6','Joe',[0,0]),roll('2d6+1','Joe',[1,1]),roll('d8','Joe',[3]),roll('2d6','Bill',[5,5]),roll('d20+5','Bill',[19])];
    render(<PlayersTab rolls={rolls} roomId="" viewerId="viewer"/>);
    expect(within(screen.getByRole('row',{name:/PbtA misses · Count/})).getAllByRole('cell').map(cell=>cell.textContent)).toEqual(['2','0']);
    expect(within(screen.getByRole('row',{name:/Nat 20s · Count/})).getAllByRole('cell').map(cell=>cell.textContent)).toEqual(['0','1']);
  });

  it('uses numeric final results for Sum and Average but all matches for Count',()=>{
    savePlayerStatistics('viewer',[saved('count','All','count'),saved('sum','Totals','sum'),saved('average','Means','average')]);
    const text=roll('d{Miss,Hit}','Joe',[0]);
    render(<PlayersTab rolls={[roll('d6','Joe',[2]),roll('d6','Joe',[4]),text,roll('d6','Bill',[5])]} roomId="" viewerId="viewer"/>);
    expect(within(screen.getByRole('row',{name:/All · Count/})).getAllByRole('cell').map(cell=>cell.textContent)).toEqual(['3','1']);
    expect(within(screen.getByRole('row',{name:/Totals · Sum/})).getAllByRole('cell').map(cell=>cell.textContent)).toEqual(['8','6']);
    expect(within(screen.getByRole('row',{name:/Means · Average/})).getAllByRole('cell').map(cell=>cell.textContent)).toEqual(['4','6']);
    savePlayerStatistics('viewer-2',[saved('sum','Text only','sum',{pattern:'^d\\{Miss,Hit\\}$'})]);
    render(<PlayersTab rolls={[text]} roomId="" viewerId="viewer-2"/>);
    expect(within(screen.getByRole('row',{name:/Text only · Sum/})).getByRole('cell').textContent).toBe('—');
  });

  it('persists additions by viewer, supports edit/delete, and preserves isolation',()=>{
    const rolls=[roll('d6','Joe',[0])],view=render(<PlayersTab rolls={rolls} roomId="room-a" viewerId="viewer"/>);
    fireEvent.click(screen.getByRole('button',{name:'Add statistic'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Saved'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));
    expect(screen.getByRole('row',{name:/Saved · Count/})).toBeTruthy();view.unmount();
    const again=render(<PlayersTab rolls={rolls} roomId="room-b" viewerId="viewer"/>);expect(screen.getByRole('row',{name:/Saved · Count/})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Edit Saved'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Edited'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));expect(screen.getByRole('row',{name:/Edited · Count/})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Delete Edited'}));expect(screen.queryByText(/Edited · Count/)).toBeNull();again.unmount();
    render(<PlayersTab rolls={rolls} roomId="room-a" viewerId="other-viewer"/>);expect(screen.queryByText(/Saved · Count|Edited · Count/)).toBeNull();
  });

  it('rejects blank names, malformed regexes, and missing required numbers',()=>{
    render(<PlayersTab rolls={[]} roomId="" viewerId="viewer"/>);fireEvent.click(screen.getByRole('button',{name:'Add statistic'}));fireEvent.click(screen.getByRole('button',{name:'Save'}));expect(screen.getByRole('alert').textContent).toMatch(/Name/);
    fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Bad'}});fireEvent.change(screen.getByLabelText('Expression regex'),{target:{value:'['}});fireEvent.click(screen.getByRole('button',{name:'Save'}));expect(screen.getByRole('alert').textContent).toMatch(/regex/);
    fireEvent.change(screen.getByLabelText('Expression regex'),{target:{value:''}});fireEvent.change(screen.getByLabelText('Result'),{target:{value:'='}});fireEvent.change(screen.getByLabelText('Result value'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Save'}));expect(screen.getByRole('alert').textContent).toMatch(/numeric/);
  });
});
