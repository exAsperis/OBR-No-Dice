import type { StoredRoll } from './sessionLedger';
import type { Comparison } from './sessionStats';
import { dieType } from './analytics';

export type ResultComparison=Comparison|'any';
export interface SequenceEntry { roll:StoredRoll; order:number }
export interface PlayerSequenceSummary { playerId:string; name:string; eligible:number; matching:number; rate:number; sum:number; numericCount:number; mean:number|null }
export interface SequenceAnalysis { entries:SequenceEntry[]; players:PlayerSequenceSummary[]; eligible:number; matching:number; error?:string }
export interface NumericCriterion { comparison:ResultComparison; value:number }
export interface RollCriterion extends NumericCriterion { dieType?:string }
export interface SequenceCriteria { pattern:string; selectedPlayers:string[]; result:NumericCriterion; roll:RollCriterion; category?:string; from?:number; until?:number }
const compare=(outcome:unknown,criterion:NumericCriterion)=>criterion.comparison==='any'||(typeof outcome==='number'&&Number.isFinite(outcome)&&(criterion.comparison==='='?outcome===criterion.value:criterion.comparison==='<='?outcome<=criterion.value:outcome>=criterion.value));

/** Compare final numeric expression results. Regexes run against canonical expressions without dialect prefixes. */
export function buildSequenceAnalysis(rolls:StoredRoll[],pattern:string,selectedPlayers:string[],comparison:ResultComparison,value:number):SequenceAnalysis {
  return buildQueryAnalysis(rolls,{pattern,selectedPlayers,result:{comparison,value},roll:{comparison:'any',value:0}});
}

/** One pass over the visible session rolls; a Roll criterion matches any qualifying structured die draw. */
export function buildQueryAnalysis(rolls:StoredRoll[],criteria:SequenceCriteria):SequenceAnalysis {
  let regex:RegExp;
  try { regex=new RegExp(criteria.pattern,'i'); } catch(error) { return {entries:[],players:[],eligible:0,matching:0,error:error instanceof Error?error.message:'Invalid regular expression'}; }
  const selected=new Set(criteria.selectedPlayers);
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
    const matches=compare(outcome,criteria.result)
      &&(criteria.roll.comparison==='any'||roll.resolution.dice.some(draw=>(!criteria.roll.dieType||dieType(roll,draw)===criteria.roll.dieType)&&compare(draw.face,criteria.roll)))
      &&(!criteria.category||roll.result.interpretation===criteria.category)
      &&(criteria.from===undefined||roll.timestamp>=criteria.from)
      &&(criteria.until===undefined||roll.timestamp<criteria.until);
    if(!matches)continue;
    summary.matching++;
    if(typeof outcome==='number'&&Number.isFinite(outcome)){summary.sum+=outcome;summary.numericCount++;}
    entries.push({roll,order:index+1});
  }
  return {entries,eligible,matching:entries.length,players:[...players].map(([playerId,item])=>({playerId,name:item.name,eligible:item.eligible,matching:item.matching,rate:item.eligible?item.matching/item.eligible:0,sum:item.sum,numericCount:item.numericCount,mean:item.numericCount?item.sum/item.numericCount:null}))};
}
