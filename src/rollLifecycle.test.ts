import {describe,expect,it} from 'vitest';
import {canStartAutoDismiss,canSubmitRoll,canUseRevealActions} from './rollLifecycle';

describe('transactional roll UI locks',()=>{
  it('keeps Roll locked through evaluation and presentation storage',()=>{
    expect(canSubmitRoll('d20',false,false)).toBe(true);
    expect(canSubmitRoll('d20',true,false)).toBe(false);
    expect(canSubmitRoll('d20',false,true)).toBe(false);
    expect(canSubmitRoll('',false,false)).toBe(false);
  });
  it('keeps reroll and dismiss locked until the matching stored acknowledgement',()=>{
    expect(canUseRevealActions('A',null,false)).toBe(false);
    expect(canUseRevealActions('A','B',false)).toBe(false);
    expect(canUseRevealActions('A','A',false)).toBe(true);
    expect(canUseRevealActions('A','A',true)).toBe(false);
  });
  it('does not begin auto-dismiss before storage and visual completion',()=>{
    expect(canStartAutoDismiss('A',null,false,true,true)).toBe(false);
    expect(canStartAutoDismiss('A','A',false,false,true)).toBe(false);
    expect(canStartAutoDismiss('A','A',false,true,false)).toBe(false);
    expect(canStartAutoDismiss('A','A',false,true,true)).toBe(true);
  });
});
