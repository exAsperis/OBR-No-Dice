import type { StoredRoll } from './sessionLedger';
import { dieType, naturalBounds } from './analytics';

export interface InterpretationCount {value:string;count:number}
export function interpretationCounts(rolls:StoredRoll[]):InterpretationCount[]{const counts=new Map<string,number>();for(const roll of rolls){const value=roll.result.interpretation;if(value)counts.set(value,(counts.get(value)??0)+1);}return [...counts].map(([value,count])=>({value,count})).sort((a,b)=>a.value.localeCompare(b.value));}
export function naturalCounts(rolls:StoredRoll[],selectedType:string):{available:boolean;minimum:number;maximum:number}{let available=false,minimum=0,maximum=0;for(const roll of rolls)for(const draw of roll.resolution.dice){if(dieType(roll,draw)!==selectedType)continue;const bounds=naturalBounds(roll,draw);if(!bounds||typeof draw.face!=='number'||!Number.isFinite(draw.face))continue;available=true;if(draw.face===bounds[0])minimum++;if(draw.face===bounds[1])maximum++;}return {available,minimum,maximum};}
export const distributionBarPercent=(count:number,maxCount:number)=>maxCount?Math.max(2,count/maxCount*100):0;
