import type { StoredRoll } from './sessionLedger';

export const TIMELINE_BUCKET_MS=600_000;
export interface TimelineBand {start:number;end:number;rolls:StoredRoll[];bandCount:number}

export function buildTimelineBands(rolls:StoredRoll[],minutes=10):TimelineBand[]{
  if(!rolls.length)return [];
  const duration=Number.isFinite(minutes)&&minutes>0?minutes*60_000:TIMELINE_BUCKET_MS;
  const ordered=[...rolls].sort((a,b)=>a.timestamp-b.timestamp);
  const first=Math.floor(ordered[0].timestamp/duration)*duration;
  const last=Math.floor(ordered.at(-1)!.timestamp/duration)*duration;
  const bands:TimelineBand[]=[];let index=0;
  for(let start=first;start<=last;start+=duration){const end=start+duration,band:StoredRoll[]=[];while(index<ordered.length&&ordered[index].timestamp<end)band.push(ordered[index++]);bands.push({start,end,rolls:band,bandCount:1});}
  return bands;
}

export function collapseEmptyTimelineBands(bands:TimelineBand[]):TimelineBand[]{
  const rows:TimelineBand[]=[];
  for(let index=0;index<bands.length;){const band=bands[index];if(band.rolls.length){rows.push(band);index++;continue;}let end=index+1;while(end<bands.length&&!bands[end].rolls.length)end++;const count=end-index;if(count===1)rows.push(band);else rows.push({start:band.start,end:bands[end-1].end,rolls:[],bandCount:count});index=end;}
  return rows;
}

export function timelineMarkerSize(score:number|null|undefined):number{
  if(score==null||!Number.isFinite(score))return 12;
  return 6+Math.max(0,Math.min(1,score))*12;
}
