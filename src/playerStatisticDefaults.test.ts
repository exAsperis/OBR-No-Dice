import { describe,expect,it } from 'vitest';
import { DEFAULT_PLAYER_STATISTICS } from './playerStatisticDefaults';

describe('default player statistics',()=>{
  it('defines four unique count starters',()=>{expect(DEFAULT_PLAYER_STATISTICS).toHaveLength(4);expect(new Set(DEFAULT_PLAYER_STATISTICS.map(item=>item.id)).size).toBe(4);expect(DEFAULT_PLAYER_STATISTICS.every(item=>item.aggregate==='count')).toBe(true);});
  it('defines natural d20 rolls',()=>{expect(DEFAULT_PLAYER_STATISTICS.find(item=>item.id==='default:nat-20')).toMatchObject({rollComparison:'=',rollValue:20,rollDie:'d20'});expect(DEFAULT_PLAYER_STATISTICS.find(item=>item.id==='default:nat-1')).toMatchObject({rollComparison:'=',rollValue:1,rollDie:'d20'});});
  it('defines PbtA result bands for 2d6 with an optional modifier',()=>{const miss=DEFAULT_PLAYER_STATISTICS.find(item=>item.id==='default:pbta-miss')!,strong=DEFAULT_PLAYER_STATISTICS.find(item=>item.id==='default:pbta-strong-hit')!;expect(miss).toMatchObject({resultComparison:'<=',resultValue:6,rollComparison:'any'});expect(strong).toMatchObject({resultComparison:'>=',resultValue:10,rollComparison:'any'});for(const statistic of [miss,strong]){const regex=new RegExp(statistic.pattern);expect(regex.test('2d6')).toBe(true);expect(regex.test('2d6+2')).toBe(true);expect(regex.test('2d6-1')).toBe(true);expect(regex.test('d20')).toBe(false);}});
});
