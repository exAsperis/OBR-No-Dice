import { beforeEach, describe, expect, it } from 'vitest';
import { deletePlayerStatistic, loadPlayerStatistics, playerStatisticsStorageKey, replacePlayerStatistic, savePlayerStatistics, type SavedPlayerStatistic } from './playerStatistics';

const statistic=(id:string,name=id):SavedPlayerStatistic=>({id,name,aggregate:'count',pattern:'',resultComparison:'any',resultValue:6,rollComparison:'any',rollValue:20,rollDie:'',category:'',from:'',until:''});
beforeEach(()=>localStorage.clear());

describe('player statistic persistence',()=>{
  it('saves, reloads, and preserves creation order',()=>{savePlayerStatistics('viewer',[statistic('a'),statistic('b')]);expect(loadPlayerStatistics('viewer').map(item=>item.id)).toEqual(['a','b']);});
  it('replaces in place and deletes definitions',()=>{let list=[statistic('a'),statistic('b')];list=replacePlayerStatistic('viewer',list,statistic('a','Edited'));expect(list.map(item=>item.name)).toEqual(['Edited','b']);list=deletePlayerStatistic('viewer',list,'a');expect(loadPlayerStatistics('viewer').map(item=>item.id)).toEqual(['b']);});
  it('isolates viewers without room-scoped keys',()=>{savePlayerStatistics('viewer-a',[statistic('a')]);savePlayerStatistics('viewer-b',[statistic('b')]);expect(loadPlayerStatistics('viewer-a')[0].id).toBe('a');expect(loadPlayerStatistics('viewer-b')[0].id).toBe('b');expect(playerStatisticsStorageKey('viewer-a')).not.toContain('room');});
  it('fails safely for missing viewers, corrupt data, and unsupported versions',()=>{expect(loadPlayerStatistics('')).toEqual([]);localStorage.setItem(playerStatisticsStorageKey('viewer'),'{bad');expect(loadPlayerStatistics('viewer')).toEqual([]);localStorage.setItem(playerStatisticsStorageKey('viewer'),JSON.stringify({version:2,statistics:[statistic('a')]}));expect(loadPlayerStatistics('viewer')).toEqual([]);});
});
