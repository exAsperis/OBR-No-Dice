import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TimelineTab } from './TimelineTab';
import { PlayerColorRegistry } from './playerColors';
import { normalizeExpression, type StoredRoll } from './sessionLedger';
import { rollExpression } from './rollService';
import { TIMELINE_BUCKET_MS } from './timelineStats';

let id=0;const base=Math.floor(new Date(2026,0,1,19,0).getTime()/TIMELINE_BUCKET_MS)*TIMELINE_BUCKET_MS;
const roll=(expression:string,player:string,face:number,minutes:number,interpretation?:string):StoredRoll=>{const result=rollExpression({requestId:`timeline-${++id}`,expression,visibility:'everyone',playerId:player,playerName:player},{integer:max=>(face-1)%max}).record;result.interpretation=interpretation;return {id:result.requestId,sessionId:'s',timestamp:base+minutes*60_000,rollerId:player,rollerName:player,expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};};
beforeEach(()=>localStorage.clear());

describe('TimelineTab',()=>{
  it('renders chronological bands, player legend, colors, marker sizes, and accessible details',()=>{
    new PlayerColorRegistry('room','viewer').remember({id:'Joe',color:'#ff0000'},1);new PlayerColorRegistry('room','viewer').remember({id:'Bill',color:'#0000ff'},1);
    const late=roll('d{Miss,Hit}','Bill',1,31),early=roll('d20','Joe',1,1,'Critical miss');
    render(<TimelineTab rolls={[late,early]} roomId="room" viewerId="viewer"/>);
    expect(document.querySelector('.filter-summary')?.textContent).toContain('10-minute bands · 2 rolls');
    expect(screen.getByLabelText('Players').textContent).toBe('JoeBill');
    expect(document.querySelectorAll('.timeline-band')).toHaveLength(3);
    expect(screen.getByText('2 empty bands')).toBeTruthy();
    const markers=screen.getAllByRole('img');
    expect(markers[0].getAttribute('aria-label')).toContain('Joe');expect(markers[0].getAttribute('aria-label')).toContain('d20 → 1');expect(markers[0].getAttribute('aria-label')).toContain('Critical miss');expect(markers[0].getAttribute('aria-label')).toContain('Percentile: 2.5%');
    expect((markers[0] as HTMLElement).style.width).toBe('6.3px');expect((markers[0] as HTMLElement).style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(markers[1].getAttribute('aria-label')).not.toContain('Percentile:');expect((markers[1] as HTMLElement).style.width).toBe('12px');
    expect(document.querySelector('.timeline-band-time')?.getAttribute('title')).toContain(new Date(base).toLocaleString());
    fireEvent.change(screen.getByLabelText('Band duration (minutes)'),{target:{value:'5'}});
    expect(document.querySelector('.filter-summary')?.textContent).toContain('5-minute bands');
    expect(screen.getByText('5 empty bands')).toBeTruthy();
  });
  it('labels estimated percentile positions without rarity claims',()=>{render(<TimelineTab rolls={[roll('d6r','Joe',6,1)]} roomId="" viewerId=""/>);const label=screen.getByRole('img').getAttribute('aria-label')!;expect(label).toContain('Percentile: ~');expect(label).toContain('(estimated)');expect(label).not.toContain('tail');});
  it('shows a concise empty state without legends or bands',()=>{render(<TimelineTab rolls={[]} roomId="" viewerId=""/>);expect(screen.getByText('No rolls yet.')).toBeTruthy();expect(document.querySelector('.timeline-bands')).toBeNull();expect(screen.queryByLabelText('Players')).toBeNull();});
});
