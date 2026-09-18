import type { ResultComparison } from './sequenceStats';

export interface QueryPreset {
  id:string;
  label:string;
  description:string;
  pattern:string;
  result?:{comparison:ResultComparison;value:number};
  roll?:{comparison:ResultComparison;value:number;dieType?:string};
  mode?:'results'|'dice';
}

/** Add a preset here; the Query tab renders and applies every entry automatically. */
export const QUERY_PRESETS:readonly QueryPreset[]=[
  {id:'pbta-miss',label:'PbtA 6-',description:'2d6± expression with a final result of 6 or less',pattern:String.raw`^2d6(?:[+-]\d+)?$`,result:{comparison:'<=',value:6}},
  {id:'pbta-hit',label:'PbtA 10+',description:'2d6± expression with a final result of 10 or more',pattern:String.raw`^2d6(?:[+-]\d+)?$`,result:{comparison:'>=',value:10}},
  {id:'nat-20',label:'Nat 20',description:'Any natural 20 on a d20, including modified results',pattern:'',roll:{comparison:'=',value:20,dieType:'d20'},mode:'dice'},
  {id:'nat-1',label:'Nat 1',description:'Any natural 1 on a d20, including modified results',pattern:'',roll:{comparison:'=',value:1,dieType:'d20'},mode:'dice'},
  {id:'snake-eyes',label:'Snake Eyes',description:'An unmodified 2d6 roll totaling 2',pattern:'^2d6$',result:{comparison:'=',value:2}},
  {id:'boxcars',label:'Boxcars',description:'An unmodified 2d6 roll totaling 12',pattern:'^2d6$',result:{comparison:'=',value:12}},
];
