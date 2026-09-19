import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from './engine/parser';
import { roll } from './engine/evaluate';
import { WorkDieCell, WorkDraws } from './WorkDraws';
import type { RollResult } from './protocol';

describe('work draw badges', () => {
  it('shows ordinary and rare individual draw badges', () => {
    let next=0;
    const ast=parse('2d20');
    const outcome=roll(ast,{integer:()=>[6,19][next++]});
    const result={resolution:{ast,dice:outcome.dice??[]}} as RollResult;
    const html=renderToStaticMarkup(<WorkDraws result={result} indices={[0,1]} moments={[{type:'die-rarity',tier:'unusual',probability:.05,label:'d20 → 20',drawIndex:1}]}/>);
    expect(html).toContain('>7</span>');
    expect(html).toContain('work-draw rarity-unusual');
    expect(html).toContain('>20</span>');
  });
  it('groups a large pool with its die term in one wrapping cell', () => {
    const result={resolution:{dice:Array.from({length:10},(_,dieIndex)=>({die:'10d6',dieIndex,face:dieIndex%6+1,kind:'initial' as const}))}} as RollResult;
    const html=renderToStaticMarkup(<WorkDieCell die="10d6 →" result={result} indices={Array.from({length:10},(_,index)=>index)} moments={[]}/>);
    expect(html).toContain('class="work-die-cell"');
    expect(html).toContain('10d6 →');
    expect(html.match(/class="work-draw"/g)).toHaveLength(10);
  });
  it('marks only draws that trigger an explosion', () => {
    const result={resolution:{dice:[{die:'d6!',dieIndex:0,face:6,kind:'initial' as const,exploded:true},{die:'d6!',dieIndex:0,face:5,kind:'explosion' as const}]}} as RollResult;
    const html=renderToStaticMarkup(<WorkDraws result={result} indices={[0,1]} moments={[]}/>);
    expect(html.match(/work-draw-exploded/g)).toHaveLength(1);
    expect(html).toContain('>6</span>');
    expect(html).toContain('>5</span>');
  });
  it('marks discarded reroll draws with a slash', () => {
    const result={resolution:{dice:[{die:'d4r',dieIndex:0,face:1,kind:'initial' as const,rerolled:true},{die:'d4r',dieIndex:0,face:3,kind:'reroll' as const}]}} as RollResult;
    const html=renderToStaticMarkup(<WorkDraws result={result} indices={[0,1]} moments={[]}/>);
    expect(html).toContain('work-draw-rerolled');
  });
  it('does not let streak rarity style an individual die badge', () => {
    const result={resolution:{dice:[{die:'d20',dieIndex:0,face:20,kind:'initial' as const}]}} as RollResult;
    const streak={type:'streak-rarity' as const,tier:'legendary' as const,probability:.0001,label:'Streak'};
    const html=renderToStaticMarkup(<WorkDraws result={result} indices={[0]} moments={[streak]}/>);
    expect(html).toContain('class="work-draw"');
    expect(html).not.toContain('rarity-legendary');
  });
  it('colors explosion triggers by their chain position',()=>{
    const result={resolution:{dice:[
      {die:'d6!',dieIndex:0,face:6,kind:'initial' as const,exploded:true,explosionNumber:1},
      {die:'d6!',dieIndex:0,face:6,kind:'explosion' as const,exploded:true,explosionNumber:2},
      {die:'d6!',dieIndex:0,face:6,kind:'explosion' as const,exploded:true,explosionNumber:3},
      {die:'d6!',dieIndex:0,face:6,kind:'explosion' as const,exploded:true,explosionNumber:4},
    ]}} as RollResult;
    const html=renderToStaticMarkup(<WorkDraws result={result} indices={[0,1,2,3]} moments={[]}/>);
    for(const color of ['#e3535a','#ee913d','#e4c443','#ffffff'])expect(html).toContain(`--rarity-color:${color}`);
  });
});
