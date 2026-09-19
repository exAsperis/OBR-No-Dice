import { EXTENSION_ID } from './constants';
import type { ResultComparison } from './sequenceStats';

export type PlayerStatisticAggregate='count'|'sum'|'average';
export interface SavedPlayerStatistic {
  id:string;name:string;aggregate:PlayerStatisticAggregate;pattern:string;
  resultComparison:ResultComparison;resultValue:number;
  rollComparison:ResultComparison;rollValue:number;rollDie:string;
  category:string;from:string;until:string;
}
interface PersistedPlayerStatistics {version:1;statistics:SavedPlayerStatistic[]}

export const playerStatisticsStorageKey=(viewerId:string)=>`${EXTENSION_ID}/player-statistics/${viewerId}`;
const comparisons:ResultComparison[]=['any','=','<=','>='];
const valid=(value:unknown):value is SavedPlayerStatistic=>{
  if(!value||typeof value!=='object')return false;
  const item=value as Record<string,unknown>;
  return typeof item.id==='string'&&Boolean(item.id)&&typeof item.name==='string'&&Boolean(item.name.trim())
    &&(item.aggregate==='count'||item.aggregate==='sum'||item.aggregate==='average')
    &&typeof item.pattern==='string'&&comparisons.includes(item.resultComparison as ResultComparison)&&Number.isFinite(item.resultValue)
    &&comparisons.includes(item.rollComparison as ResultComparison)&&Number.isFinite(item.rollValue)
    &&typeof item.rollDie==='string'&&typeof item.category==='string'&&typeof item.from==='string'&&typeof item.until==='string';
};
export function loadPlayerStatistics(viewerId:string):SavedPlayerStatistic[]{
  if(!viewerId)return [];
  try{const raw=localStorage.getItem(playerStatisticsStorageKey(viewerId));if(!raw)return [];const parsed=JSON.parse(raw) as Partial<PersistedPlayerStatistics>;return parsed.version===1&&Array.isArray(parsed.statistics)&&parsed.statistics.every(valid)?parsed.statistics:[];}catch{return [];}
}
export function savePlayerStatistics(viewerId:string,statistics:SavedPlayerStatistic[]):void{
  if(!viewerId)return;
  try{localStorage.setItem(playerStatisticsStorageKey(viewerId),JSON.stringify({version:1,statistics} satisfies PersistedPlayerStatistics));}catch{/* Personal statistics remain optional if storage is unavailable. */}
}
export function replacePlayerStatistic(viewerId:string,statistics:SavedPlayerStatistic[],statistic:SavedPlayerStatistic):SavedPlayerStatistic[]{
  const index=statistics.findIndex(item=>item.id===statistic.id);const next=[...statistics];if(index<0)next.push(statistic);else next[index]=statistic;savePlayerStatistics(viewerId,next);return next;
}
export function deletePlayerStatistic(viewerId:string,statistics:SavedPlayerStatistic[],id:string):SavedPlayerStatistic[]{const next=statistics.filter(item=>item.id!==id);savePlayerStatistics(viewerId,next);return next;}
