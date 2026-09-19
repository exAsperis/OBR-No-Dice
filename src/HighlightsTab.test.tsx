import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HighlightsTab } from './HighlightsTab';
import { rollExpression } from './rollService';
import { normalizeExpression, type StoredRoll } from './sessionLedger';

let serial=0;
function roll(expression:string,faces:number[],time:number,player='Joe'):StoredRoll{let index=0;const result=rollExpression({requestId:`highlight-ui-${++serial}`,expression,visibility:'everyone',playerId:player,playerName:player},{integer:max=>(faces[index++]??faces.at(-1)??0)%max}).record;result.time=time;return {id:result.requestId,sessionId:'session',timestamp:time,rollerId:player,rollerName:player,expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};}

describe('HighlightsTab',()=>{
  it('replaces raw extrema with normalized cards and uses PlayerName colors',()=>{render(<HighlightsTab rolls={[roll('d100',[86],1),roll('d6',[5],2)]} roomId="room" viewerId="viewer"/>);expect(screen.getByText('⬆ Highest normalized result')).toBeTruthy();expect(screen.getByText('⬇ Lowest normalized result')).toBeTruthy();expect(screen.queryByText(/Highest final result/)).toBeNull();expect(screen.queryByText(/Lowest final result/)).toBeNull();expect(document.querySelectorAll('.player-color-disk').length).toBeGreaterThan(0);});
  it('labels estimated normalized positions without making a rarity card',()=>{render(<HighlightsTab rolls={[roll('d6r',[5],1)]} roomId="room" viewerId="viewer"/>);expect(screen.getAllByText(/estimated/).length).toBeGreaterThan(0);expect(screen.queryByText('🎯 Rarest result')).toBeNull();});
  it('presents shared rarity details with player, expression, result, tier, and probability',()=>{render(<HighlightsTab rolls={[roll('4d6',[5,5,5,5],1,'Bill')]} roomId="room" viewerId="viewer"/>);expect(screen.getByText('🎯 Rarest result')).toBeTruthy();expect(screen.getAllByText('Bill').length).toBeGreaterThan(0);expect(screen.getAllByText('4d6').length).toBeGreaterThan(0);expect(screen.getByText(/Extraordinary · 0\.077%/)).toBeTruthy();});
  it('keeps pool size separate from explosion depth',()=>{render(<HighlightsTab rolls={[roll('d6!2',[5,5,0],1)]} roomId="room" viewerId="viewer"/>);expect(screen.getByText('1 die in one initial term')).toBeTruthy();expect(screen.getByText('2 additional draws from one die')).toBeTruthy();});
  it('omits empty sections and handles no rolls',()=>{const {rerender}=render(<HighlightsTab rolls={[roll('d6',[2],1)]} roomId="room" viewerId="viewer"/>);expect(screen.queryByRole('heading',{name:'Streaks'})).toBeNull();expect(screen.queryByRole('heading',{name:'Session pace'})).toBeNull();rerender(<HighlightsTab rolls={[]} roomId="room" viewerId="viewer"/>);expect(screen.getByText('No rolls yet.')).toBeTruthy();});
});
