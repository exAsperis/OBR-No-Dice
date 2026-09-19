import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS, readRoomSettings, ROOM_SETTINGS_KEY } from './roomSettings';

describe('room settings', () => {
  it('defaults calculation speed to 500 ms', () => {
    expect(DEFAULT_ROOM_SETTINGS.calculationSpeedMs).toBe(500);
  });
  it('accepts instant calculation and an empty shortcut rail', () => {
    expect(readRoomSettings({ [ROOM_SETTINGS_KEY]: { calculationSpeedMs: 0, shortcuts: [] } })).toEqual({ calculationSpeedMs: 0, shortcuts: [], verifiableRollsEnabled: false, overrideMode:{enabled:false,overrides:[]} });
  });
  it('falls back when shared metadata is malformed', () => {
    expect(readRoomSettings({ [ROOM_SETTINGS_KEY]: { calculationSpeedMs: -1, shortcuts: [{ label: '', term: 'd6' }] } })).toEqual(DEFAULT_ROOM_SETTINGS);
  });
  it('rejects malformed and duplicate overrides in room metadata',()=>{
    const settings=readRoomSettings({[ROOM_SETTINGS_KEY]:{overrideMode:{enabled:false,overrides:[{die:'d20',value:21},{die:'d20',value:20}]}}});
    expect(settings.overrideMode).toEqual({enabled:false,overrides:[]});
    const malformed=readRoomSettings({[ROOM_SETTINGS_KEY]:{overrideMode:{enabled:true,overrides:[],previousSession:{id:'same',name:'Game',startedAt:1},overrideSession:{id:'same',name:'OVERRIDE',startedAt:2,kind:'override'}}}});
    expect(malformed.overrideMode?.enabled).toBe(false);
  });
  it('normalizes custom terms, sequences, and legacy single values',()=>{
    const settings=readRoomSettings({[ROOM_SETTINGS_KEY]:{overrideMode:{enabled:false,overrides:[
      {die:'d{0,1,2,3}',values:[3,0]},{die:'d{-1,0,1}',value:-1},
    ]}}});
    expect(settings.overrideMode?.overrides).toEqual([
      {die:'d{0..3}',values:[3,0]},{die:'d{-1..1}',values:[-1]},
    ]);
  });
});
