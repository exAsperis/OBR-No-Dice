import { describe, expect, it } from 'vitest';
import type { StoredRoll } from './sessionLedger';
import { buildTimelineBands, collapseEmptyTimelineBands, timelineMarkerSize, TIMELINE_BUCKET_MS } from './timelineStats';

const base=Math.floor(new Date(2026,0,1,19,0).getTime()/TIMELINE_BUCKET_MS)*TIMELINE_BUCKET_MS;
const roll=(id:string,minutes:number)=>({id,timestamp:base+minutes*60_000} as StoredRoll);

describe('timeline statistics',()=>{
  it('uses fixed clock-aligned ten-minute boundaries',()=>{const bands=buildTimelineBands([roll('a',1),roll('b',9),roll('c',10),roll('d',19)]);expect(bands.map(band=>band.start)).toEqual([base,base+TIMELINE_BUCKET_MS]);expect(bands.map(band=>band.rolls.map(item=>item.id))).toEqual([['a','b'],['c','d']]);});
  it('includes meaningful empty bands',()=>{const bands=buildTimelineBands([roll('a',1),roll('b',31)]);expect(bands).toHaveLength(4);expect(bands.map(band=>band.rolls.length)).toEqual([1,0,0,1]);});
  it('supports user-selected minute durations',()=>{const bands=buildTimelineBands([roll('a',1),roll('b',6),roll('c',11)],5);expect(bands.map(band=>band.start)).toEqual([base,base+300_000,base+600_000]);});
  it('collapses only consecutive empty bands',()=>{const bands=buildTimelineBands([roll('a',1),roll('b',21),roll('c',51)]);const rows=collapseEmptyTimelineBands(bands);expect(rows.map(row=>[row.start,row.end,row.bandCount,row.rolls.length])).toEqual([[base,base+600_000,1,1],[base+600_000,base+1_200_000,1,0],[base+1_200_000,base+1_800_000,1,1],[base+1_800_000,base+3_000_000,2,0],[base+3_000_000,base+3_600_000,1,1]]);});
  it('sorts bands and rolls without mutating input',()=>{const input=[roll('late',8),roll('next',12),roll('early',2)],ids=input.map(item=>item.id);const bands=buildTimelineBands(input);expect(bands.flatMap(band=>band.rolls.map(item=>item.id))).toEqual(['early','late','next']);expect(input.map(item=>item.id)).toEqual(ids);});
  it.each([[0,6],[.25,9],[.5,12],[.75,15],[1,18],[-1,6],[2,18],[null,12],[undefined,12]] as const)('maps marker score %s to %s px',(score,size)=>expect(timelineMarkerSize(score)).toBe(size));
});
