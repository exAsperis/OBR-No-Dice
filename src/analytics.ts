import type { StoredRoll } from './sessionLedger';
import { parse } from './engine/parser';
import { distribution, type Distribution } from './engine/probability';
import type { Node } from './engine/ast';
import type { Dialect } from './engine/ast';

export type RollFilter={player?:string;expression?:string};
export const filterRolls=(rolls:StoredRoll[],filter:RollFilter)=>rolls.filter(r=>(!filter.player||r.rollerId===filter.player)&&(!filter.expression||r.normalizedExpression===filter.expression));
export const expressionLabel=(key:string)=>key.slice(key.indexOf(':')+1);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const key=(v:unknown)=>`${typeof v}:${String(v)}`;
const theoreticalCache=new Map<string,Distribution|null>();
const referenceCache=new Map<string,Distribution|null>();
const numericDistribution=(chart:Distribution|null):chart is Distribution=>!!chart&&chart.entries.length>0&&chart.entries.every(entry=>finite(entry.value));
const parseKey=(keyName:string)=>{const separator=keyName.indexOf(':');const dialect=keyName.slice(0,separator) as 'nodice'|'roll20';return parse(expressionLabel(keyName),dialect);};
export function theoretical(keyName:string):Distribution|null {
  if(theoreticalCache.has(keyName))return theoreticalCache.get(keyName)!;
  let result:Distribution|null=null;
  try { const chart=distribution(parseKey(keyName),true);if(chart?.exact&&numericDistribution(chart))result=chart; } catch { /* Unsupported expression. */ }
  theoreticalCache.set(keyName,result);if(result)referenceCache.set(keyName,result);return result;
}
export function referenceDistribution(keyName:string):Distribution|null {
  if(referenceCache.has(keyName))return referenceCache.get(keyName)!;
  const exact=theoretical(keyName);if(exact)return exact;
  let result:Distribution|null=null;
  try { const chart=distribution(parseKey(keyName));if(numericDistribution(chart))result=chart; } catch { /* Unsupported expression. */ }
  referenceCache.set(keyName,result);if(result?.exact)theoreticalCache.set(keyName,result);return result;
}
export const clearTheoreticalCache=()=>{theoreticalCache.clear();referenceCache.clear();};
export interface PercentileResult {score:number;tail:number|null;exact:boolean;trials?:number;mean?:number;range?:[number,number]}
/** Discrete midpoint percentile: P(X < x) + P(X = x)/2. Extremes use inclusive tails. */
export function percentileFromDistribution(value:number,chart:Distribution):PercentileResult|null {
  if(!finite(value)||!numericDistribution(chart))return null;
  let lower=0,equal=0,upper=0;
  for(const item of chart.entries){const sample=item.value as number;if(sample<value)lower+=item.probability;else if(sample>value)upper+=item.probability;else equal+=item.probability;}
  if(chart.exact&&equal<1e-12)return null;
  return {score:Math.max(0,Math.min(1,lower+equal/2)),tail:chart.exact?Math.min(lower+equal,upper+equal):null,exact:chart.exact,trials:chart.trials,mean:chart.mean,range:chart.range};
}
export function percentile(roll:StoredRoll):PercentileResult|null {
  if(!finite(roll.finalResult))return null;
  const chart=referenceDistribution(roll.normalizedExpression);return chart?percentileFromDistribution(roll.finalResult,chart):null;
}
export function dieType(roll:StoredRoll,draw:StoredRoll['resolution']['dice'][number]){
  if(draw.die==='legacy')return 'Legacy die';
  const ast=roll.resolution.ast;
  let found:Node|undefined;
  const visit=(node:Node):void=>{if(node.kind==='dice'&&node.span.start===draw.nodeSpan?.start&&node.span.end===draw.nodeSpan?.end){found=node;return;}for(const value of Object.values(node)){if(value&&typeof value==='object'){if(Array.isArray(value))value.forEach(x=>{if(x&&typeof x==='object'&&'kind' in x)visit(x as Node);});else if('kind' in value)visit(value as Node);}}};
  if(draw.nodeSpan)visit(ast);
  const die=found?.kind==='dice'?found.die:undefined;
  if(die?.kind==='standard-die'&&die.sides.kind==='literal')return `d${die.sides.value}`;
  if(die?.kind==='custom-die')return `d{${die.facets.map(f=>f.kind==='value'?f.value:'…').join(',')}}`;
  return draw.die||'Custom die';
}
export function naturalBounds(roll:StoredRoll,draw:StoredRoll['resolution']['dice'][number]):[number,number]|null{
  const type=dieType(roll,draw);const standard=/^d(\d+)$/.exec(type);if(standard)return [1,Number(standard[1])];
  if(type.startsWith('d{')){const values=type.slice(2,-1).split(',').map(Number);if(values.length&&values.every(Number.isFinite))return [Math.min(...values),Math.max(...values)];}
  return null;
}
export function outcomeDistribution(rolls:StoredRoll[],mode:'results'|'dice',type?:string){
  const groups=new Map<string,{value:number|string;count:number}>();let count=0;
  const add=(value:number|string)=>{const id=key(value);const item=groups.get(id)??{value,count:0};item.count++;groups.set(id,item);count++;};
  for(const roll of rolls){if(mode==='results'){const v=roll.finalResult;add(Array.isArray(v)?`[${v.join(', ')}]`:v);}else for(const draw of roll.resolution.dice)if(!type||dieType(roll,draw)===type)add(draw.face);}
  const rows=[...groups.values()].sort((a,b)=>finite(a.value)&&finite(b.value)?a.value-b.value:String(a.value).localeCompare(String(b.value)));
  const numbers=mode==='results'?rolls.map(r=>r.finalResult).filter(finite).sort((a,b)=>a-b):rows.flatMap(r=>finite(r.value)?Array(r.count).fill(r.value) as number[]:[]).sort((a,b)=>a-b);
  const middle=Math.floor(numbers.length/2);return {rows,count,min:numbers[0],max:numbers.at(-1),mean:numbers.length?numbers.reduce((a,b)=>a+b,0)/numbers.length:null,median:numbers.length?(numbers[middle]+numbers[Math.floor((numbers.length-1)/2)])/2:null,modes:rows.filter(r=>r.count===Math.max(0,...rows.map(x=>x.count))).map(r=>r.value)};
}
export function summary(rolls:StoredRoll[]){
  const ordered=[...rolls].sort((a,b)=>a.timestamp-b.timestamp);
  const players=new Set(rolls.map(r=>r.rollerId)),expressions=new Set(rolls.map(r=>r.normalizedExpression));
  let longestGap=0;for(let i=1;i<ordered.length;i++)longestGap=Math.max(longestGap,ordered[i].timestamp-ordered[i-1].timestamp);
  const busiest=(window:number)=>{let start=0,best=0,at=0;for(let end=0;end<ordered.length;end++){while(ordered[end].timestamp-ordered[start].timestamp>=window)start++;if(end-start+1>best){best=end-start+1;at=ordered[start].timestamp;}}return {count:best,at};};
  const ranking=(values:Map<string,{label:string;count:number}>,least=false)=>{const entries=[...values.values()];const target=least?Math.min(...entries.map(v=>v.count)):Math.max(...entries.map(v=>v.count));return entries.length?{names:entries.filter(v=>v.count===target).map(v=>v.label),count:target}:null;};
  const p=new Map<string,{label:string;count:number}>(),e=new Map<string,{label:string;count:number}>();
  for(const r of rolls){const a=p.get(r.rollerId)??{label:r.rollerName,count:0};a.count++;p.set(r.rollerId,a);const b=e.get(r.normalizedExpression)??{label:expressionLabel(r.normalizedExpression),count:0};b.count++;e.set(r.normalizedExpression,b);}
  const numeric=rolls.filter(r=>finite(r.finalResult));const max=numeric.length?Math.max(...numeric.map(r=>r.finalResult as number)):null,min=numeric.length?Math.min(...numeric.map(r=>r.finalResult as number)):null;
  const diceTypes=new Map<string,number>();for(const r of rolls)for(const d of r.resolution.dice){const t=dieType(r,d);diceTypes.set(t,(diceTypes.get(t)??0)+1);}
  const duration=ordered.length>1?ordered.at(-1)!.timestamp-ordered[0].timestamp:0;
  return {rolls:rolls.length,dice:rolls.reduce((n,r)=>n+r.resolution.dice.length,0),players:players.size,expressions:expressions.size,first:ordered[0]?.timestamp,last:ordered.at(-1)?.timestamp,duration,perHour:duration>0?rolls.length*3_600_000/duration:null,longestGap,busiestTen:busiest(600_000),fastestMinute:busiest(60_000),most:ranking(p),least:ranking(p,true),expression:ranking(e),die:ranking(new Map([...diceTypes].map(([label,count])=>[label,{label,count}]))),high:numeric.filter(r=>r.finalResult===max),low:numeric.filter(r=>r.finalResult===min)};
}
export function playerStats(rolls:StoredRoll[]){const groups=new Map<string,StoredRoll[]>();for(const r of rolls){const list=groups.get(r.rollerId)??[];list.push(r);groups.set(r.rollerId,list);}return [...groups].map(([id,list])=>{let mins=0,maxs=0,sum=0,qualifying=0,exactQualifying=0,estimatedQualifying=0;for(const r of list){const p=percentile(r);if(p){sum+=p.score;qualifying++;if(p.exact)exactQualifying++;else estimatedQualifying++;}for(const d of r.resolution.dice){const bounds=naturalBounds(r,d);if(bounds&&finite(d.face)){if(d.face===bounds[0])mins++;if(d.face===bounds[1])maxs++;}}}return {id,name:list.at(-1)!.rollerName,rolls:list.length,dice:list.reduce((n,r)=>n+r.resolution.dice.length,0),expressions:new Set(list.map(r=>r.normalizedExpression)).size,average:qualifying?sum/qualifying:null,qualifying,exactQualifying,estimatedQualifying,mins,maxs,first:Math.min(...list.map(r=>r.timestamp)),last:Math.max(...list.map(r=>r.timestamp)),list};}).sort((a,b)=>b.rolls-a.rolls||a.name.localeCompare(b.name));}
export function hotCold(players:ReturnType<typeof playerStats>){const eligible=players.filter(p=>p.qualifying>=10&&p.average!==null);if(eligible.length<2)return null;const high=Math.max(...eligible.map(p=>p.average!)),low=Math.min(...eligible.map(p=>p.average!));if(high-low<0.001)return {hot:[],cold:[],tie:true};return {hot:eligible.filter(p=>Math.abs(p.average!-high)<0.001),cold:eligible.filter(p=>Math.abs(p.average!-low)<0.001),tie:false};}
export function expressionStats(rolls:StoredRoll[]){const groups=new Map<string,StoredRoll[]>();for(const r of rolls){const list=groups.get(r.normalizedExpression)??[];list.push(r);groups.set(r.normalizedExpression,list);}return [...groups].map(([id,list])=>{const values=list.map(r=>r.finalResult).filter(finite);const chart=theoretical(id),separator=id.indexOf(':');return {id,label:expressionLabel(id),dialect:(separator<0?'nodice':id.slice(0,separator)) as Dialect,rolls:list.length,rollers:new Set(list.map(r=>r.rollerId)).size,numericCount:values.length,expected:chart?.mean??null,range:chart?.range,observed:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,distribution:outcomeDistribution(list,'results'),chart,list};}).sort((a,b)=>b.rolls-a.rolls);}
type Streak={player:string;count:number;roll:StoredRoll};
function streak(ordered:StoredRoll[],high:boolean):Streak|null {let best:Streak|null=null;const current=new Map<string,number>();for(const r of ordered){const p=percentile(r);if(!p||p.score===0.5||(p.score>0.5)!==high){current.set(r.rollerId,0);continue;}const count=(current.get(r.rollerId)??0)+1;current.set(r.rollerId,count);if(!best||count>best.count)best={player:r.rollerId,count,roll:r};}return best&&best.count>=3?best:null;}
function naturalStreak(ordered:StoredRoll[],maximum:boolean):Streak|null {let best:Streak|null=null;const current=new Map<string,number>();for(const r of ordered)for(const d of r.resolution.dice){const b=naturalBounds(r,d);if(!b||!finite(d.face)||d.face!==b[maximum?1:0]){current.set(r.rollerId,0);continue;}const count=(current.get(r.rollerId)??0)+1;current.set(r.rollerId,count);if(!best||count>best.count)best={player:r.rollerId,count,roll:r};}return best&&best.count>=2?best:null;}
export function highlights(rolls:StoredRoll[]){const ordered=[...rolls].sort((a,b)=>a.timestamp-b.timestamp);let rare:{roll:StoredRoll;tail:number}|null=null,largest:StoredRoll|null=null,explosion:{roll:StoredRoll;count:number}|null=null;for(const r of rolls){const p=percentile(r);if(p&&p.tail!==null&&p.tail<=0.1&&(!rare||p.tail<rare.tail))rare={roll:r,tail:p.tail};if(!largest||r.resolution.dice.length>largest.resolution.dice.length)largest=r;const chains=new Map<string,number>();for(const draw of r.resolution.dice)if(draw.kind==='explosion'&&draw.nodeSpan){const id=`${draw.nodeSpan.start}:${draw.nodeSpan.end}:${draw.dieIndex}`;const count=(chains.get(id)??0)+1;chains.set(id,count);if(!explosion||count>explosion.count)explosion={roll:r,count};}}return {rare,largest,explosion,highStreak:streak(ordered,true),lowStreak:streak(ordered,false),naturalMin:naturalStreak(ordered,false),naturalMax:naturalStreak(ordered,true)};}
export function fairness(rolls:StoredRoll[],expression:string,window=100){const chart=theoretical(expression);if(!chart)return null;const selected=rolls.filter(r=>r.normalizedExpression===expression&&finite(r.finalResult)&&percentile(r)!==null);const counts=new Map<number,number>();for(const r of selected){const value=r.finalResult as number;counts.set(value,(counts.get(value)??0)+1);}const recent=selected.slice(-window),recentCounts=new Map<number,number>();for(const r of recent){const value=r.finalResult as number;recentCounts.set(value,(recentCounts.get(value)??0)+1);}const rows=chart.entries.map(e=>{const value=e.value as number,observed=counts.get(value)??0,p=e.probability,n=selected.length,margin=n?1.96*Math.sqrt(p*(1-p)/n):0;return {value,observed,observedRate:n?observed/n:0,expected:p,range:n?[Math.max(0,p-margin),Math.min(1,p+margin)] as [number,number]:null};});let sum=0;const cumulative=selected.map((r,i)=>{const score=percentile(r)!.score;sum+=score;return {roll:i+1,average:sum/(i+1)};});return {rows,sample:selected.length,recent:recent.length,rolling:chart.entries.map(e=>({value:e.value as number,rate:recent.length?(recentCounts.get(e.value as number)??0)/recent.length:0})),cumulative,chart};}
