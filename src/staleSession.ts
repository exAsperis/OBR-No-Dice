import type { DiceSession, StoredRoll } from './sessionLedger';

export const SOFT_STALE_AFTER=4*60*60*1000;
export const VERY_STALE_AFTER=24*60*60*1000;
export interface StaleReminder {sessionId:string;resumedAt:number;lastOldRoll:number;level:'soft'|'very'}

export function detectStaleSession(session:DiceSession|null,rolls:StoredRoll[],isGm:boolean,now=Date.now()):StaleReminder|undefined {
  if(!isGm||!session||!rolls.length)return;
  const sorted=[...rolls].sort((a,b)=>a.timestamp-b.timestamp);
  const last=sorted.at(-1)!.timestamp;
  const idle=now-last;
  if(idle>SOFT_STALE_AFTER)return {sessionId:session.id,resumedAt:0,lastOldRoll:last,level:idle>VERY_STALE_AFTER?'very':'soft'};
  for(let i=sorted.length-1;i>=1;i--){
    const gap=sorted[i].timestamp-sorted[i-1].timestamp;
    if(gap>SOFT_STALE_AFTER)return {sessionId:session.id,resumedAt:sorted[i].timestamp,lastOldRoll:sorted[i-1].timestamp,level:gap>VERY_STALE_AFTER?'very':'soft'};
  }
}
export const reminderKey=(reminder:StaleReminder)=>`${reminder.sessionId}/${reminder.resumedAt||reminder.lastOldRoll}`;
