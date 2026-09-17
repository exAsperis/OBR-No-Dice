import { describe, expect, it } from 'vitest';
import { DICE_SHORTCUTS, applyDiceShortcutOnce, insertDiceShortcut } from './shortcuts';
import { parseAuto } from './engine/parser';
import { roll } from './engine/evaluate';

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
  it('preserves everything after the interpretation pipe',()=>{
    expect(insertDiceShortcut('d6 | unfinished table','d6')).toBe('2d6 | unfinished table');
    expect(insertDiceShortcut('d6 +  | unfinished table','d8')).toBe('d6 + d8  | unfinished table');
    expect(insertDiceShortcut('| 1:Hit','d6')).toBe('d6| 1:Hit');
  });
  it('uses an existing operator or one supplied by the shortcut',()=>{
    for(const operator of ['+','-','*','/']) {
      expect(insertDiceShortcut(`d6 ${operator} `,'d8')).toBe(`d6 ${operator} d8`);
      expect(insertDiceShortcut('d6',`${operator}d8`)).toBe(`d6 ${operator} d8`);
      expect(insertDiceShortcut('d6 + ',`${operator}d8`)).toBe(`d6 ${operator} d8`);
      expect(insertDiceShortcut('d6 +  | 1:Hit',`${operator}d8`)).toBe(`d6 ${operator} d8  | 1:Hit`);
    }
    expect(insertDiceShortcut('d6','-d6')).toBe('d6 - d6');
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
  it('combines interpretation rules in current-first order for the final total',()=>{
    const combined=insertDiceShortcut('d6 | 3:Current','d8 | 3:Shortcut; 4:Other');
    expect(combined).toBe('d6 + d8 | 3:Current; 3:Shortcut; 4:Other');
    expect(roll(parseAuto(combined).ast,{integer:()=>0}).interpretation).toBeUndefined();
    expect(roll(parseAuto(combined).ast,{integer:(max)=>max===6?0:1}).interpretation).toBe('Current');
    expect(insertDiceShortcut('d6 | 1:One;','d8 | 2:Two')).toBe('d6 + d8 | 1:One; 2:Two');
  });
  it('combines labels and preserves sole annotations',()=>{
    expect(insertDiceShortcut('d6 # Attack','d8 # Bonus')).toBe('d6 + d8 # Attack + Bonus');
    expect(insertDiceShortcut('d6','d8 # Bonus')).toBe('d6 + d8 # Bonus');
    expect(insertDiceShortcut('d6 # Attack','d8')).toBe('d6 + d8 # Attack');
    expect(insertDiceShortcut('d6 | 2:Hit # Attack','d8 | 3:Crit # Bonus')).toBe('d6 + d8 | 2:Hit; 3:Crit # Attack + Bonus');
  });
  it('handles empty inputs, annotation-only shortcuts, and operator shortcuts',()=>{
    expect(insertDiceShortcut('','d6 | 1:Hit # Attack')).toBe('d6 | 1:Hit # Attack');
    expect(insertDiceShortcut('d6','| 1:Hit')).toBe('d6 | 1:Hit');
    expect(insertDiceShortcut('d6 # Attack','# Bonus')).toBe('d6 # Attack + Bonus');
    expect(insertDiceShortcut('d6 | 1:Old','+d8 | 2:New')).toBe('d6 + d8 | 1:Old; 2:New');
    expect(insertDiceShortcut('d6 +  | 1:Old','-d8 | 2:New')).toBe('d6 - d8  | 1:Old; 2:New');
    expect(insertDiceShortcut('d6 | 1:Old','d6 | 2:New')).toBe('2d6 | 1:Old; 2:New');
  });
  it('keeps incomplete draft rules while adding shortcut rules',()=>{
    expect(insertDiceShortcut('d6 | unfinished table','d8 | 3:New')).toBe('d6 + d8 | unfinished table; 3:New');
    expect(insertDiceShortcut('d6 |','d8 | 3:New')).toBe('d6 + d8 | 3:New');
  });
  it('deduplicates annotated shortcut clicks',()=>{
    const seen=new Set<string>();
    const first=applyDiceShortcutOnce('d6 | 1:Old # Attack','d8 | 2:New # Bonus','annotated-1',seen)!;
    expect(first).toBe('d6 + d8 | 1:Old; 2:New # Attack + Bonus');
    expect(applyDiceShortcutOnce(first,'d8 | 2:New # Bonus','annotated-1',seen)).toBeNull();
  });
});
