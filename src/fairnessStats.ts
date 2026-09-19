import { percentileFromDistribution, theoretical } from './analytics';
import type { Distribution } from './engine/probability';
import type { StoredRoll } from './sessionLedger';

export interface FairnessRow {
  value:number;observed:number;observedRate:number;recentObserved:number;recentRate:number;
  expected:number;difference:number;recentDifference:number;range:[number,number]|null;supported:boolean;
}
export interface FairnessTrendPoint {roll:number;average:number;timestamp:number}
export interface FairnessData {
  chart:Distribution;sample:number;players:number;observedMean:number|null;expectedMean:number|null;meanDifference:number|null;
  averagePercentile:number|null;outsideSupport:number;rows:FairnessRow[];recent:number;recentWindow:number;cumulative:FairnessTrendPoint[];
}

export function buildFairness(rolls:StoredRoll[],expression:string,options:{playerId?:string;recentWindow?:number}={}):FairnessData|null{
  const chart=theoretical(expression);if(!chart)return null;
  const recentWindow=options.recentWindow??100;
  const selected=[...rolls].filter(roll=>roll.normalizedExpression===expression&&(!options.playerId||roll.rollerId===options.playerId)&&typeof roll.finalResult==='number'&&Number.isFinite(roll.finalResult)).sort((a,b)=>a.timestamp-b.timestamp);
  const expected=new Map<number,number>(chart.entries.map(entry=>[entry.value as number,entry.probability]));
  const observed=new Map<number,number>(),recentObserved=new Map<number,number>();
  for(const roll of selected){const value=roll.finalResult as number;observed.set(value,(observed.get(value)??0)+1);}
  const recentRolls=selected.slice(-recentWindow);for(const roll of recentRolls){const value=roll.finalResult as number;recentObserved.set(value,(recentObserved.get(value)??0)+1);}
  let percentileSum=0,comparable=0,outsideSupport=0;const cumulative:FairnessTrendPoint[]=[];
  selected.forEach((roll,index)=>{const value=roll.finalResult as number,result=percentileFromDistribution(value,chart);if(!result){outsideSupport++;return;}percentileSum+=result.score;comparable++;cumulative.push({roll:index+1,average:percentileSum/comparable,timestamp:roll.timestamp});});
  const values=[...new Set([...expected.keys(),...observed.keys()])].sort((a,b)=>a-b),sample=selected.length,recent=recentRolls.length;
  const rows=values.map(value=>{const probability=expected.get(value)??0,count=observed.get(value)??0,recentCount=recentObserved.get(value)??0,observedRate=sample?count/sample:0,recentRate=recent?recentCount/recent:0,margin=sample?1.96*Math.sqrt(probability*(1-probability)/sample):0;return {value,observed:count,observedRate,recentObserved:recentCount,recentRate,expected:probability,difference:observedRate-probability,recentDifference:recentRate-probability,range:sample?[Math.max(0,probability-margin),Math.min(1,probability+margin)] as [number,number]:null,supported:expected.has(value)};});
  const observedMean=sample?selected.reduce((sum,roll)=>sum+(roll.finalResult as number),0)/sample:null,expectedMean=chart.mean??null;
  return {chart,sample,players:new Set(selected.map(roll=>roll.rollerId)).size,observedMean,expectedMean,meanDifference:observedMean!==null&&expectedMean!==null?observedMean-expectedMean:null,averagePercentile:comparable?percentileSum/comparable:null,outsideSupport,rows,recent,recentWindow,cumulative};
}
