import { describe, expect, it } from 'vitest';
import { QUERY_PRESETS } from './queryPresets';
import { buildQueryAnalysis } from './sequenceStats';
import { normalizeExpression, type StoredRoll } from './sessionLedger';
import { rollExpression } from './rollService';

let id=0;
function record(expression:string,faces:number[]):StoredRoll{
  let index=0;
  const result=rollExpression({requestId:`query-${++id}`,expression,visibility:'everyone',playerId:'Joe',playerName:'Joe'},{integer:max=>(faces[index++]??0)%max}).record;
  return {id:result.requestId,sessionId:'s',timestamp:id,rollerId:'Joe',rollerName:'Joe',expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};
}
describe('query presets',()=>{
  it('keeps stable unique IDs and a valid regex for every shortcut',()=>{expect(new Set(QUERY_PRESETS.map(p=>p.id)).size).toBe(QUERY_PRESETS.length);for(const preset of QUERY_PRESETS)expect(()=>new RegExp(preset.pattern)).not.toThrow();});
  it('finds natural d20 faces regardless of final modifiers and excludes other die types',()=>{
    const rolls=[record('d20+5',[19]),record('d20',[0]),record('d{20}',[0])];
    const preset=QUERY_PRESETS.find(item=>item.id==='nat-20')!;
    const analysis=buildQueryAnalysis(rolls,{pattern:preset.pattern,selectedPlayers:['Joe'],result:{comparison:'any',value:0},roll:preset.roll!});
    expect(analysis.entries.map(entry=>entry.roll.expression)).toEqual(['d20+5']);
  });
  it('combines final result and individual Roll criteria',()=>{
    const rolls=[record('2d6',[0,0]),record('2d6',[5,5])];
    const analysis=buildQueryAnalysis(rolls,{pattern:'^2d6$',selectedPlayers:['Joe'],result:{comparison:'>=',value:10},roll:{comparison:'=',value:6,dieType:'d6'}});
    expect(analysis.eligible).toBe(2);expect(analysis.matching).toBe(1);expect(analysis.players[0].matching).toBe(1);
  });
  it('searches every structured draw, including a face replaced by a reroll',()=>{
    const recordWithReroll=record('d20ro=1',[0,19]);
    expect(recordWithReroll.resolution.dice.map(draw=>draw.kind)).toEqual(['initial','reroll']);
    const analysis=buildQueryAnalysis([recordWithReroll],{pattern:'',selectedPlayers:['Joe'],result:{comparison:'any',value:0},roll:{comparison:'=',value:1,dieType:'d20'}});
    expect(analysis.matching).toBe(1);
  });
});
