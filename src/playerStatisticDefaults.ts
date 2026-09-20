import type { SavedPlayerStatistic } from './playerStatistics';

/**
 * Add or edit built-in starter statistics here.
 * They are copied into the user's editable statistics list.
 */
export const DEFAULT_PLAYER_STATISTICS:readonly SavedPlayerStatistic[]=[
  {id:'default:nat-20',name:'Nat 20',aggregate:'count',pattern:'',resultComparison:'any',resultValue:0,rollComparison:'=',rollValue:20,rollDie:'d20'},
  {id:'default:nat-1',name:'Nat 1',aggregate:'count',pattern:'',resultComparison:'any',resultValue:0,rollComparison:'=',rollValue:1,rollDie:'d20'},
  {id:'default:pbta-miss',name:'PbtA Miss',aggregate:'count',pattern:String.raw`^2d6(?:[+-]\d+)?$`,resultComparison:'<=',resultValue:6,rollComparison:'any',rollValue:0,rollDie:''},
  {id:'default:pbta-strong-hit',name:'PbtA Strong hit',aggregate:'count',pattern:String.raw`^2d6(?:[+-]\d+)?$`,resultComparison:'>=',resultValue:10,rollComparison:'any',rollValue:0,rollDie:''},
];
