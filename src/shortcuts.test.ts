import { describe, expect, it } from 'vitest';
import { DICE_SHORTCUTS, applyDiceShortcutOnce, insertDiceShortcut } from './shortcuts';
import { parseAuto } from './engine/parser';

describe('dice shortcuts',()=>{
  it('provides valid terms for every shortcut',()=>{
    expect(DICE_SHORTCUTS.map(item=>item.label)).toEqual(['Coin','d4','d6','d8','d10','d12','d20','d100','%']);
    for(const shortcut of DICE_SHORTCUTS)expect(()=>parseAuto(shortcut.term),shortcut.label).not.toThrow();
  });
  it('inserts into an empty or existing expression',()=>{
    expect(insertDiceShortcut('','d6')).toBe('d6');
    expect(insertDiceShortcut('2','d6')).toBe('2 + d6');
    expect(insertDiceShortcut('d6','d8')).toBe('d6 + d8');
    expect(insertDiceShortcut('d6 + ','d8')).toBe('d6 + d8');
    expect(insertDiceShortcut('d6 | 6-:Fail','d8')).toBe('d6 + d8 | 6-:Fail');
  });
  it('increments only the immediate matching die term',()=>{
    expect(insertDiceShortcut('d6','d6')).toBe('2d6');
    expect(insertDiceShortcut('2d6','d6')).toBe('3d6');
    expect(insertDiceShortcut('d6 + d6','d6')).toBe('d6 + 2d6');
    expect(insertDiceShortcut('d6 + 2','d6')).toBe('d6 + 2 + d6');
    expect(insertDiceShortcut('d{0,1}','d{0,1}')).toBe('2d{0,1}');
    expect(insertDiceShortcut('d{0..100}','d{0..100}')).toBe('2d{0..100}');
    expect(insertDiceShortcut('d6!','d6')).toBe('d6! + d6');
  });
  it('applies each shortcut click once even if relayed twice',()=>{
    const seen=new Set<string>();
    const first=applyDiceShortcutOnce('','d6','click-1',seen);
    expect(first).toBe('d6');
    expect(applyDiceShortcutOnce(first!,'d6','click-1',seen)).toBeNull();
    expect(applyDiceShortcutOnce(first!,'d6','click-2',seen)).toBe('2d6');
  });
});
