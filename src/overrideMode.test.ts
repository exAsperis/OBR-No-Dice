import { describe,expect,it } from 'vitest';
import { overrideMetadata, overrideTransition, validOverrideList } from './overrideMode';
import { DEFAULT_ROOM_SETTINGS, readRoomSettings, ROOM_SETTINGS_KEY } from './roomSettings';
import { SESSION_KEY, type DiceSession } from './sessionLedger';

const real:DiceSession={id:'real',name:'Friday Game',startedAt:100};
describe('Override Mode transition',()=>{
  it.each([true,false])('restores the prior Verifiable Rolls value %s',prior=>{
    const metadata={[ROOM_SETTINGS_KEY]:{...DEFAULT_ROOM_SETTINGS,verifiableRollsEnabled:prior},[SESSION_KEY]:real};
    const enabled=overrideTransition(metadata,[{die:'d20',value:20}],true,()=> 'fixed',200);
    expect(enabled.session).toEqual({id:'override-fixed',name:'OVERRIDE',startedAt:200,kind:'override'});
    expect(enabled.settings.verifiableRollsEnabled).toBe(false);
    expect(enabled.settings.overrideMode?.previousVerifiableRollsEnabled).toBe(prior);
    expect(enabled.settings.overrideMode?.previousSession).toEqual(real);
    const active=overrideMetadata(enabled);
    expect(readRoomSettings(active).overrideMode?.enabled).toBe(true);
    const disabled=overrideTransition(active,[{die:'d20',value:20}],false);
    expect(disabled.session).toEqual(real);
    expect(disabled.settings.verifiableRollsEnabled).toBe(prior);
    expect(disabled.settings.overrideMode).toEqual({enabled:false,overrides:[{die:'d20',value:20}]});
  });
  it('rejects illegal and duplicate die entries',()=>{
    expect(validOverrideList([{die:'d20',value:20},{die:'d20',value:1}])).toBe(false);
    expect(validOverrideList([{die:'d6',value:7}])).toBe(false);
    expect(validOverrideList([{die:'2d6',value:6}])).toBe(false);
    expect(()=>overrideTransition({[SESSION_KEY]:real},[{die:'d6',value:7}],true)).toThrow('legal face');
  });
});
