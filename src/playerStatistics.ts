import { EXTENSION_ID } from './constants';
import { DEFAULT_PLAYER_STATISTICS } from './playerStatisticDefaults';
import type { ResultComparison } from './sequenceStats';

export type PlayerStatisticAggregate='count'|'sum'|'average';
export interface SavedPlayerStatistic {
  id:string;name:string;aggregate:PlayerStatisticAggregate;pattern:string;
  resultComparison:ResultComparison;resultValue:number;
  rollComparison:ResultComparison;rollValue:number;rollDie:string;
}
interface PersistedPlayerStatistics {version:2;statistics:SavedPlayerStatistic[]}

export const playerStatisticsStorageKey=(viewerId:string)=>`${EXTENSION_ID}/player-statistics/${viewerId}`;
const comparisons:ResultComparison[]=['any','=','<=','>='];
const valid=(value:unknown):value is SavedPlayerStatistic=>{
  if(!value||typeof value!=='object')return false;
  const item=value as Record<string,unknown>;
  return typeof item.id==='string'&&Boolean(item.id)&&typeof item.name==='string'&&Boolean(item.name.trim())
    &&(item.aggregate==='count'||item.aggregate==='sum'||item.aggregate==='average')
    &&typeof item.pattern==='string'&&comparisons.includes(item.resultComparison as ResultComparison)&&Number.isFinite(item.resultValue)
    &&comparisons.includes(item.rollComparison as ResultComparison)&&Number.isFinite(item.rollValue)&&typeof item.rollDie==='string';
};
const copyDefaults=()=>DEFAULT_PLAYER_STATISTICS.map(statistic=>({...statistic}));
const migrateV1=(statistics:unknown[]):SavedPlayerStatistic[]|null=>{
  const migrated=statistics.map(value=>{
    if(!value||typeof value!=='object')return null;
    const {category:_category,from:_from,until:_until,...statistic}=value as Record<string,unknown>;
    return valid(statistic)?statistic:null;
  });
  if(migrated.some(statistic=>statistic===null))return null;
  const existing=migrated as SavedPlayerStatistic[],ids=new Set(existing.map(statistic=>statistic.id));
  return [...copyDefaults().filter(statistic=>!ids.has(statistic.id)),...existing];
};
export function loadPlayerStatistics(viewerId:string):SavedPlayerStatistic[]{
  if(!viewerId)return [];
  try{
    const raw=localStorage.getItem(playerStatisticsStorageKey(viewerId));if(!raw)return copyDefaults();
    const parsed=JSON.parse(raw) as {version?:unknown;statistics?:unknown};
    if(parsed.version===2&&Array.isArray(parsed.statistics)&&parsed.statistics.every(valid))return parsed.statistics;
    if(parsed.version===1&&Array.isArray(parsed.statistics)){
      const migrated=migrateV1(parsed.statistics);if(!migrated)return [];
      savePlayerStatistics(viewerId,migrated);return migrated;
    }
    return [];
  }catch{return [];}
}
export function savePlayerStatistics(viewerId:string,statistics:SavedPlayerStatistic[]):void{
  if(!viewerId)return;
  try{localStorage.setItem(playerStatisticsStorageKey(viewerId),JSON.stringify({version:2,statistics} satisfies PersistedPlayerStatistics));}catch{/* Personal statistics remain optional if storage is unavailable. */}
}
export function normalizePlayerStatisticDieType(value:string):string|null{
  const trimmed=value.trim();if(!trimmed)return '';
  const match=/^d([1-9]\d*)$/i.exec(trimmed);if(!match)return null;
  const sides=Number(match[1]);return Number.isSafeInteger(sides)&&sides<=1000?`d${sides}`:null;
}
export function replacePlayerStatistic(viewerId:string,statistics:SavedPlayerStatistic[],statistic:SavedPlayerStatistic):SavedPlayerStatistic[]{
  const index=statistics.findIndex(item=>item.id===statistic.id);const next=[...statistics];if(index<0)next.push(statistic);else next[index]=statistic;savePlayerStatistics(viewerId,next);return next;
}
export function deletePlayerStatistic(viewerId:string,statistics:SavedPlayerStatistic[],id:string):SavedPlayerStatistic[]{const next=statistics.filter(item=>item.id!==id);savePlayerStatistics(viewerId,next);return next;}
