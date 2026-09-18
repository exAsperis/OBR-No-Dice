import type { StoredRoll } from './sessionLedger';
import type { Comparison } from './sessionStats';

export type ResultComparison=Comparison|'any';
export interface SequenceEntry { roll:StoredRoll; order:number }
export interface PlayerSequenceSummary { playerId:string; name:string; eligible:number; matching:number; rate:number; mean:number|null }
export interface SequenceAnalysis { entries:SequenceEntry[]; players:PlayerSequenceSummary[]; eligible:number; matching:number; error?:string }

/** Compare final numeric expression results. Regexes run against canonical expressions without dialect prefixes. */
export function buildSequenceAnalysis(rolls:StoredRoll[],pattern:string,selectedPlayers:string[],comparison:ResultComparison,value:number):SequenceAnalysis {
  let regex:RegExp;
  try { regex=new RegExp(pattern,'i'); } catch(error) { return {entries:[],players:[],eligible:0,matching:0,error:error instanceof Error?error.message:'Invalid regular expression'}; }
  const selected=new Set(selectedPlayers);
  const players=new Map<string,{name:string;eligible:number;matching:number;sum:number;numericCount:number}>();
  for(const roll of rolls)if(selected.has(roll.rollerId))players.set(roll.rollerId,{name:roll.rollerName,eligible:0,matching:0,sum:0,numericCount:0});
  const entries:SequenceEntry[]=[];
  let eligible=0;
  for(let index=0;index<rolls.length;index++){
    const roll=rolls[index];if(!selected.has(roll.rollerId))continue;
    const expression=roll.normalizedExpression.slice(roll.normalizedExpression.indexOf(':')+1);
    if(!regex.test(expression))continue;
    eligible++;
    const summary=players.get(roll.rollerId)!;summary.eligible++;
    const outcome=roll.finalResult;
    const matches=comparison==='any'||(typeof outcome==='number'&&Number.isFinite(outcome)&&(comparison==='='?outcome===value:comparison==='<='?outcome<=value:outcome>=value));
    if(!matches)continue;
    summary.matching++;
    if(typeof outcome==='number'&&Number.isFinite(outcome)){summary.sum+=outcome;summary.numericCount++;}
    entries.push({roll,order:index+1});
  }
  return {entries,eligible,matching:entries.length,players:[...players].map(([playerId,item])=>({playerId,name:item.name,eligible:item.eligible,matching:item.matching,rate:item.eligible?item.matching/item.eligible:0,mean:item.numericCount?item.sum/item.numericCount:null}))};
}
