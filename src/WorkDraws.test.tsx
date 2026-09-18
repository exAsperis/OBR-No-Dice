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
});
