import type { StoredRoll } from './sessionLedger';

export type OutcomeMode='results'|'dice';
export type Comparison='='|'<='|'>=';
export interface StatRow { key:string; label:string; rolls:number; dice:number; rollers:number }
export function analyzeSession(rolls:StoredRoll[],playerId?:string,expression?:string,mode:OutcomeMode='results'){
  const players=new Map<string,{name:string;rolls:number;dice:number}>();
  const expressions=new Map<string,{label:string;rolls:number;rollers:Set<string>}>();
  let dice=0;
  for(const roll of rolls){const count=roll.resolution.dice.length;dice+=count;const player=players.get(roll.rollerId)??{name:roll.rollerName,rolls:0,dice:0};player.name=roll.rollerName;player.rolls++;player.dice+=count;players.set(roll.rollerId,player);const item=expressions.get(roll.normalizedExpression)??{label:roll.normalizedExpression.split(':').slice(1).join(':'),rolls:0,rollers:new Set<string>()};item.rolls++;item.rollers.add(roll.rollerId);expressions.set(roll.normalizedExpression,item);}
  const filtered=rolls.filter(roll=>(!playerId||roll.rollerId===playerId)&&(!expression||roll.normalizedExpression===expression));
  const outcomes=new Map<string,{value:number|string;count:number}>();
  const add=(value:number|string)=>{const key=`${typeof value}:${value}`,entry=outcomes.get(key)??{value,count:0};entry.count++;outcomes.set(key,entry);};
  for(const roll of filtered){if(mode==='results'){const value=roll.finalResult;add(Array.isArray(value)?`[${value.join(', ')}]`:value);}else for(const draw of roll.resolution.dice)add(draw.face);}
  const distribution=[...outcomes.values()].sort((a,b)=>typeof a.value==='number'&&typeof b.value==='number'?a.value-b.value:String(a.value).localeCompare(String(b.value)));
  return {totalRolls:rolls.length,totalDice:dice,distinctRollers:players.size,distinctExpressions:expressions.size,players:[...players].map(([key,value])=>({key,label:value.name,rolls:value.rolls,dice:value.dice,rollers:0})).sort((a,b)=>b.rolls-a.rolls),expressions:[...expressions].map(([key,value])=>({key,label:value.label,rolls:value.rolls,dice:0,rollers:value.rollers.size})).sort((a,b)=>b.rolls-a.rolls),distribution,outcomeCount:distribution.reduce((sum,row)=>sum+row.count,0),filteredRolls:filtered.length};
}
export function queryOutcomes(distribution:Array<{value:number|string;count:number}>,operator:Comparison,threshold:number){return distribution.reduce((sum,item)=>typeof item.value==='number'&&(operator==='='?item.value===threshold:operator==='<='?item.value<=threshold:item.value>=threshold)?sum+item.count:sum,0);}
