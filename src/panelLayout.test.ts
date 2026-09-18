import { beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, clearShowWork, fittedPosition, loadCollapsed, loadDraft, loadHeight, loadPosition, loadShowWork, saveCollapsed, saveDraft, saveHeight, savePosition, saveShowWork } from './panelLayout';

describe('main panel position', () => {
  beforeEach(() => localStorage.clear());
  const viewport = { width: 1200, height: 800 };
  const panel = { width: 440, height: 650 };

  it('keeps a saved in-bounds position', () => {
    savePosition('player', { left: 50, top: 30 });
    expect(fittedPosition(loadPosition('player'), viewport, panel)).toEqual({ left: 50, top: 30 });
  });

  it('centers a saved panel that would leave the viewport', () => {
    expect(fittedPosition({ left: 800, top: 100 }, viewport, panel)).toEqual({ left: 380, top: 75 });
    expect(fittedPosition({ left: -10, top: 40 }, viewport, panel)).toEqual({ left: 380, top: 75 });
  });

  it('uses each player’s own stored position', () => {
    savePosition('one', { left: 20, top: 20 });
    savePosition('two', { left: 200, top: 50 });
    expect(loadPosition('one')).toEqual({ left: 20, top: 20 });
    expect(loadPosition('two')).toEqual({ left: 200, top: 50 });
  });

  it('keeps collapse choices per player and drafts per player and room', () => {
    saveCollapsed('one', { distribution: true, recent: false, history: true });
    saveDraft('room-a', 'one', '2d6');
    saveDraft('room-b', 'one', 'd20');
    expect(loadCollapsed('one')).toEqual({ distribution: true, recent: false, history: true });
    expect(loadCollapsed('two')).toEqual({ distribution: false, recent: false, history: true });
    expect(loadDraft('room-a', 'one')).toBe('2d6');
    expect(loadDraft('room-b', 'one')).toBe('d20');
    expect(loadDraft('room-a', 'two')).toBeNull();
    clearDraft('room-a', 'one');
    expect(loadDraft('room-a', 'one')).toBeNull();
    expect(loadDraft('room-b', 'one')).toBe('d20');
  });

  it('remembers the measured panel height for the same player', () => {
    saveHeight('one', 255);
    expect(loadHeight('one')).toBe(255);
    saveHeight('one', 2400);
    expect(loadHeight('one')).toBe(2400);
    expect(loadHeight('two')).toBe(440);
  });
  it('keeps Show work across internal panel reopens until explicitly cleared', () => {
    saveShowWork('room','player',true);
    expect(loadShowWork('room','player')).toBe(true);
    clearShowWork('room','player');
    expect(loadShowWork('room','player')).toBe(false);
  });
});
