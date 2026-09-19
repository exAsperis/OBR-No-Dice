import { describe, expect, it } from 'vitest';
import { explosionColor, RARITY_COLORS, rarityColor, rarityTier } from './rarity';
import { analyzeRollMoments } from './rollMoments';
import { normalizeExpression, type StoredRoll } from './sessionLedger';
import { rollExpression } from './rollService';
import { distribution } from './engine/probability';
import { ledgerWorkRows } from './ledgerWork';

let serial = 0;
function record(expression: string, faceIndexes: number[], playerId = 'joe'): StoredRoll {
  let index = 0;
  const result = rollExpression({requestId:`roll-${++serial}`,expression,dialect:'nodice',visibility:'everyone',playerId,playerName:playerId}, {integer:()=>faceIndexes[index++]});
  const roll = result.record;
  roll.time = serial;
  return {id:roll.requestId,sessionId:'session',timestamp:roll.time,rollerId:playerId,rollerName:playerId,expression,normalizedExpression:normalizeExpression(roll),finalResult:roll.value,resolution:roll.resolution!,visibility:roll.visibility,result:roll};
}
const moment = (rolls: StoredRoll[], type: 'die-rarity'|'result-rarity'|'streak-rarity') => analyzeRollMoments(rolls).get(rolls.at(-1)!.id)?.find(item=>item.type===type);

describe('roll rarity', () => {
  it('classifies boundaries inclusively', () => {
    for (const [threshold,tier,above] of [[.05,'unusual','ordinary'],[.01,'exceptional','unusual'],[.001,'extraordinary','exceptional'],[.0001,'legendary','extraordinary']] as const) {
      expect(rarityTier(threshold)).toBe(tier);
      expect(rarityTier(threshold+threshold*.00001)).toBe(above);
    }
  });
  it('defines the shared rarity palette from red through white',()=>{
    expect(RARITY_COLORS).toEqual({unusual:'#e3535a',exceptional:'#ee913d',extraordinary:'#e4c443',legendary:'#ffffff'});
    expect(rarityColor('ordinary')).toBeUndefined();
  });
  it('maps explosion chain depth through the shared palette',()=>{
    expect([1,2,3,4,8].map(explosionColor)).toEqual(['#e3535a','#ee913d','#e4c443','#ffffff','#ffffff']);
  });
  it('uses inclusive die tails, including both extremes', () => {
    for (const [expression,index,tier] of [['d20',0,'unusual'],['d20',19,'unusual'],['d20',1,undefined],['d20',18,undefined],['d100',0,'exceptional'],['d100',99,'exceptional'],['d6',0,undefined],['d6',5,undefined]] as const) {
      const roll = record(expression,[index]);
      expect(moment([roll],'die-rarity')?.tier).toBe(tier);
    }
  });
  it('classifies exact complete expression tails', () => {
    for (const [expression,count,tier] of [['2d6',2,'unusual'],['3d6',3,'exceptional'],['4d6',4,'extraordinary'],['6d6',6,'legendary']] as const) {
      const roll = record(expression,Array(count).fill(5));
      expect(distribution(roll.resolution.ast,true)?.exact).toBe(true);
      expect(moment([roll],'result-rarity')?.tier).toBe(tier);
    }
  });
  it('tracks successive uses per player and expression using exact result probability', () => {
    const first=record('d20',[19]);
    const otherExpression=record('2d6',[2,3]);
    const otherPlayer=record('d20',[3],'bill');
    const second=record('d20',[19]);
    const third=record('d20',[19]);
    expect(moment([first],'streak-rarity')).toBeUndefined();
    expect(moment([first,otherExpression,otherPlayer,second],'streak-rarity')?.tier).toBe('unusual');
    expect(moment([first,otherExpression,otherPlayer,second,third],'streak-rarity')?.tier).toBe('exceptional');
    const interruption=record('d20',[0]);
    expect(moment([first,second,third,interruption],'streak-rarity')).toBeUndefined();
  });
  it('uses the exact repeated result chance for longer streaks', () => {
    const sixes=Array.from({length:4},()=>record('d6',[5]));
    expect(moment(sixes,'streak-rarity')?.tier).toBe('exceptional');
    const twelves=Array.from({length:3},()=>record('2d6',[5,5]));
    expect(moment(twelves,'streak-rarity')?.tier).toBe('extraordinary');
  });
  it('skips unordered results and unknown die faces', () => {
    const roll=record('d{red,blue}',[0]);
    expect(analyzeRollMoments([roll]).get(roll.id)).toEqual([]);
  });
  it('keeps custom numeric draw identity on its work stage', () => {
    const roll=record('d{1,20}',[1]);
    expect(ledgerWorkRows(roll.result).some(row=>row.drawIndices?.includes(0))).toBe(true);
  });
});
