import { beforeEach,describe,expect,it } from 'vitest';
import { DEFAULT_PLAYER_STATISTICS } from './playerStatisticDefaults';
import { deletePlayerStatistic,loadPlayerStatistics,normalizePlayerStatisticDieType,playerStatisticsStorageKey,replacePlayerStatistic,savePlayerStatistics,type SavedPlayerStatistic } from './playerStatistics';

const statistic=(id:string,name=id):SavedPlayerStatistic=>({id,name,aggregate:'count',pattern:'',resultComparison:'any',resultValue:6,rollComparison:'any',rollValue:20,rollDie:''});
beforeEach(()=>localStorage.clear());

describe('player statistic persistence',()=>{
  it('returns fresh copies of all defaults for fresh storage',()=>{const first=loadPlayerStatistics('viewer'),second=loadPlayerStatistics('viewer');expect(first).toEqual(DEFAULT_PLAYER_STATISTICS);expect(first).not.toBe(DEFAULT_PLAYER_STATISTICS);expect(first[0]).not.toBe(DEFAULT_PLAYER_STATISTICS[0]);expect(second[0]).not.toBe(first[0]);});
  it('migrates v1 once, strips obsolete fields, preserves custom IDs, adds defaults first, and saves v2',()=>{const legacy={...statistic('custom:id'),category:'Hit',from:'2020',until:'2021'};localStorage.setItem(playerStatisticsStorageKey('viewer'),JSON.stringify({version:1,statistics:[legacy]}));const loaded=loadPlayerStatistics('viewer');expect(loaded.map(item=>item.id)).toEqual([...DEFAULT_PLAYER_STATISTICS.map(item=>item.id),'custom:id']);expect(loaded.at(-1)).toEqual(statistic('custom:id'));expect(JSON.parse(localStorage.getItem(playerStatisticsStorageKey('viewer'))!)).toEqual({version:2,statistics:loaded});});
  it('does not resurrect a deleted default from version 2',()=>{const remaining=DEFAULT_PLAYER_STATISTICS.filter(item=>item.id!=='default:nat-1');savePlayerStatistics('viewer',[...remaining]);expect(loadPlayerStatistics('viewer')).toEqual(remaining);});
  it('returns an edited version-2 default untouched',()=>{const edited={...DEFAULT_PLAYER_STATISTICS[0],name:'Critical!',rollValue:19};savePlayerStatistics('viewer',[edited]);expect(loadPlayerStatistics('viewer')).toEqual([edited]);});
  it('replaces in place and deletes definitions',()=>{let list=[statistic('a'),statistic('b')];list=replacePlayerStatistic('viewer',list,statistic('a','Edited'));expect(list.map(item=>item.name)).toEqual(['Edited','b']);list=deletePlayerStatistic('viewer',list,'a');expect(loadPlayerStatistics('viewer').map(item=>item.id)).toEqual(['b']);});
  it('isolates viewers without room-scoped keys',()=>{savePlayerStatistics('viewer-a',[statistic('a')]);savePlayerStatistics('viewer-b',[statistic('b')]);expect(loadPlayerStatistics('viewer-a')[0].id).toBe('a');expect(loadPlayerStatistics('viewer-b')[0].id).toBe('b');expect(playerStatisticsStorageKey('viewer-a')).not.toContain('room');});
  it('fails safely for missing viewers, corrupt data, and unsupported versions',()=>{expect(loadPlayerStatistics('')).toEqual([]);localStorage.setItem(playerStatisticsStorageKey('viewer'),'{bad');expect(loadPlayerStatistics('viewer')).toEqual([]);localStorage.setItem(playerStatisticsStorageKey('viewer'),JSON.stringify({version:3,statistics:[statistic('a')]}));expect(loadPlayerStatistics('viewer')).toEqual([]);});
});

describe('player statistic die type normalization',()=>{
  it.each([['',''],['   ',''],['d6','d6'],['d20','d20'],['D20','d20'],['d30','d30'],['d37','d37']])('normalizes %j to %j',(input,expected)=>expect(normalizePlayerStatisticDieType(input)).toBe(expected));
  it.each(['20','2d6','d0','d-6','d6+1','d1001','banana'])('rejects %s',input=>expect(normalizePlayerStatisticDieType(input)).toBeNull());
});
