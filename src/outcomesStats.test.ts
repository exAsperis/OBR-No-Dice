import { describe, expect, it } from 'vitest';
import { rollExpression } from './rollService';
import { normalizeExpression, type StoredRoll } from './sessionLedger';
import { distributionBarPercent, interpretationCounts, naturalCounts } from './outcomesStats';

function roll(expression:string,faces:number[],interpretation?:string):StoredRoll{
  let index=0;
  const result=rollExpression({requestId:crypto.randomUUID(),expression,visibility:'everyone',playerId:'player',playerName:'Player'},{integer:max=>(faces[index++]??0)%max}).record;
  result.interpretation=interpretation;
  return {id:result.requestId,sessionId:'session',timestamp:0,rollerId:'player',rollerName:'Player',expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};
}

describe('Outcomes helpers',()=>{
  it('counts categories without inventing an uninterpreted category',()=>{
    expect(interpretationCounts([roll('d6',[0],'Miss'),roll('d6',[1]),roll('d6',[2],'Miss'),roll('d6',[3],'Hit')])).toEqual([{value:'Hit',count:1},{value:'Miss',count:2}]);
  });

  it('distinguishes observed zero natural bounds from unavailable bounds',()=>{
    expect(naturalCounts([roll('d20',[9])],'d20')).toEqual({available:true,minimum:0,maximum:0});
    expect(naturalCounts([roll('d{Miss,Hit}',[0])],'d{Miss,Hit}').available).toBe(false);
  });

  it('scales bars against the largest visible count',()=>{
    expect(distributionBarPercent(10,10)).toBe(100);
    expect(distributionBarPercent(5,10)).toBe(50);
    expect(distributionBarPercent(1,100)).toBe(2);
  });
});
