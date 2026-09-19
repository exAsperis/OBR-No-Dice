import { naturalBounds, percentile, type PercentileResult } from './analytics';
import { analyzeRollMoments, type RollMoment } from './rollMoments';
import type { StoredRoll } from './sessionLedger';

export interface MomentHighlight {roll:StoredRoll;moment:RollMoment}
export interface PercentileHighlight {roll:StoredRoll;percentile:PercentileResult}
export interface CountHighlight {roll:StoredRoll;count:number}
export interface PoolHighlight extends CountHighlight {die:string}
export interface BurstHighlight {count:number;start:number;end:number}
export interface HighlightsData {
  rarestResult:MomentHighlight|null;rarestDie:MomentHighlight|null;rareRepeat:MomentHighlight|null;
  highest:PercentileHighlight|null;lowest:PercentileHighlight|null;largestPool:PoolHighlight|null;explosion:CountHighlight|null;
  highStreak:CountHighlight|null;lowStreak:CountHighlight|null;naturalMaximum:CountHighlight|null;naturalMinimum:CountHighlight|null;
  fastestBurst:BurstHighlight|null;
}

const moment=(ordered:StoredRoll[],moments:Map<string,RollMoment[]>,type:RollMoment['type']):MomentHighlight|null=>{let best:MomentHighlight|null=null;for(const roll of ordered)for(const item of moments.get(roll.id)??[])if(item.type===type&&(!best||item.probability<best.moment.probability))best={roll,moment:item};return best;};
const normalized=(ordered:StoredRoll[],percentiles:Map<string,PercentileResult|null>,highest:boolean):PercentileHighlight|null=>{let best:PercentileHighlight|null=null;for(const roll of ordered){const value=percentiles.get(roll.id);if(value&&(!best||(highest?value.score>best.percentile.score:value.score<best.percentile.score)))best={roll,percentile:value};}return best;};
const percentileStreak=(ordered:StoredRoll[],percentiles:Map<string,PercentileResult|null>,high:boolean):CountHighlight|null=>{let best:CountHighlight|null=null;const current=new Map<string,number>();for(const roll of ordered){const value=percentiles.get(roll.id);if(!value||value.score===.5||(value.score>.5)!==high){current.set(roll.rollerId,0);continue;}const count=(current.get(roll.rollerId)??0)+1;current.set(roll.rollerId,count);if((!best||count>best.count)&&count>=3)best={roll,count};}return best;};
const naturalStreak=(ordered:StoredRoll[],maximum:boolean):CountHighlight|null=>{let best:CountHighlight|null=null;const current=new Map<string,number>();for(const roll of ordered)for(const draw of roll.resolution.dice){const bounds=naturalBounds(roll,draw),matches=bounds&&typeof draw.face==='number'&&Number.isFinite(draw.face)&&draw.face===bounds[maximum?1:0];if(!matches){current.set(roll.rollerId,0);continue;}const count=(current.get(roll.rollerId)??0)+1;current.set(roll.rollerId,count);if((!best||count>best.count)&&count>=2)best={roll,count};}return best;};
const largestPool=(ordered:StoredRoll[]):PoolHighlight|null=>{let best:PoolHighlight|null=null;for(const roll of ordered){const groups=new Map<string,{count:number;die:string}>();for(const [index,draw] of roll.resolution.dice.entries()){if(draw.kind!=='initial')continue;const key=draw.nodeSpan?`${draw.nodeSpan.start}:${draw.nodeSpan.end}`:`legacy:${index}`;const group=groups.get(key)??{count:0,die:draw.die};group.count++;groups.set(key,group);}for(const group of groups.values())if(!best||group.count>best.count)best={roll,count:group.count,die:group.die};}return best;};
const longestExplosion=(ordered:StoredRoll[]):CountHighlight|null=>{let best:CountHighlight|null=null;for(const roll of ordered){const groups=new Map<string,number>();for(const draw of roll.resolution.dice){if(draw.kind!=='explosion'||!draw.nodeSpan)continue;const key=`${draw.nodeSpan.start}:${draw.nodeSpan.end}:${draw.dieIndex}`,count=(groups.get(key)??0)+1;groups.set(key,count);if(!best||count>best.count)best={roll,count};}}return best;};
const fastestBurst=(ordered:StoredRoll[]):BurstHighlight|null=>{let start=0,best:BurstHighlight|null=null;for(let end=0;end<ordered.length;end++){while(ordered[end].timestamp-ordered[start].timestamp>=60_000)start++;const count=end-start+1;if(count>=2&&(!best||count>best.count))best={count,start:ordered[start].timestamp,end:ordered[end].timestamp};}return best;};

export function buildHighlights(rolls:StoredRoll[]):HighlightsData{
  const ordered=[...rolls].sort((a,b)=>a.timestamp-b.timestamp),moments=analyzeRollMoments(ordered),percentiles=new Map<string,PercentileResult|null>();
  for(const roll of ordered)percentiles.set(roll.id,percentile(roll));
  return {rarestResult:moment(ordered,moments,'result-rarity'),rarestDie:moment(ordered,moments,'die-rarity'),rareRepeat:moment(ordered,moments,'streak-rarity'),highest:normalized(ordered,percentiles,true),lowest:normalized(ordered,percentiles,false),largestPool:largestPool(ordered),explosion:longestExplosion(ordered),highStreak:percentileStreak(ordered,percentiles,true),lowStreak:percentileStreak(ordered,percentiles,false),naturalMaximum:naturalStreak(ordered,true),naturalMinimum:naturalStreak(ordered,false),fastestBurst:fastestBurst(ordered)};
}

export function formatRarityProbability(probability:number):string{const percent=probability*100;if(percent>=1)return `${percent.toFixed(1)}%`;if(percent>=.1)return `${percent.toFixed(2)}%`;if(percent>=.01)return `${percent.toFixed(3)}%`;return `${percent.toFixed(4)}%`;}
