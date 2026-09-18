import { describe,expect,it } from 'vitest';
import { rollExpression } from './rollService';
import { FairnessSampler } from './engine/fairness';
import { distribution } from './engine/probability';
import { parse } from './engine/parser';
import { analyzeRollMoments } from './rollMoments';
import { normalizeExpression, type StoredRoll } from './sessionLedger';

const overrides=[{die:'d20',value:20},{die:'d6',value:6}];
const execute=(expression:string,configured=overrides,random=0,dialect:'nodice'|'roll20'='nodice')=>
  rollExpression({requestId:expression,expression,dialect,visibility:'everyone',playerId:'p',playerName:'P',overridden:true,overrides:configured},{integer:()=>random}).record;

describe('Override Mode evaluation',()=>{
  it('forces individual die terms and leaves unconfigured terms random',()=>{
    expect(execute('d20').value).toBe(20);
    expect(execute('2d6').value).toBe(12);
    expect(execute('d6+d8').value).toBe(7);
    expect(execute('d20+d8',[{die:'d20',value:20}]).value).toBe(21);
    expect(execute('d8').overridden).toBe(true);
    expect(execute('d{1,2,3,4,5,6}').value).toBe(6);
    expect(execute('d{Miss,Hit}').value).toBe('Miss');
    expect(()=>execute('d20',[{die:'d20',value:21}])).toThrow('Invalid override');
  });
  it('applies to reroll and explosion draws',()=>{
    const rerolled=execute('d6ro=1',[{die:'d6',value:1}],0,'roll20');
    expect(rerolled.resolution?.dice.map(draw=>draw.face)).toEqual([1,1]);
    expect(rerolled.resolution?.dice.map(draw=>draw.kind)).toEqual(['initial','reroll']);
    const exploded=execute('d6!2',[{die:'d6',value:6}]);
    expect(exploded.value).toBe(18);
    expect(exploded.resolution?.dice.map(draw=>draw.face)).toEqual([6,6,6]);
  });
  it('keeps theoretical probability normal while observed sampling is forced',()=>{
    const chart=distribution(parse('d20'));
    expect(chart.entries[19]).toEqual({value:20,probability:.05});
    const sampler=new FairnessSampler(parse('d20'),{integer:()=>0},[{die:'d20',value:20}]);
    expect(sampler.sample(10)).toEqual({total:10,counts:[{value:20,count:10}]});
    const forced=execute('6d6',[{die:'d6',value:6}]);
    expect(forced.value).toBe(36);
    const stored:StoredRoll={id:forced.requestId,sessionId:'override',timestamp:forced.time,rollerId:'p',rollerName:'P',expression:forced.expression,
      normalizedExpression:normalizeExpression(forced),finalResult:forced.value,resolution:forced.resolution!,visibility:forced.visibility,result:forced};
    expect(analyzeRollMoments([stored]).get(forced.requestId)?.find(moment=>moment.type==='result-rarity')?.tier).toBe('legendary');
  });
  it('marks only testing rolls',()=>{
    const forced=execute('d8');
    expect(forced.overridden).toBe(true);
    expect(forced.verification).toBeUndefined();
    const normal=rollExpression({requestId:'normal',expression:'d8',visibility:'everyone',playerId:'p',playerName:'P'},{integer:()=>0}).record;
    expect(normal.overridden).toBeUndefined();
  });
});
