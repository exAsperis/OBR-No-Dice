import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS, readRoomSettings, ROOM_SETTINGS_KEY } from './roomSettings';

describe('room settings', () => {
  it('defaults calculation speed to 500 ms', () => {
    expect(DEFAULT_ROOM_SETTINGS.calculationSpeedMs).toBe(500);
  });
  it('accepts instant calculation and an empty shortcut rail', () => {
    expect(readRoomSettings({ [ROOM_SETTINGS_KEY]: { calculationSpeedMs: 0, shortcuts: [] } })).toEqual({ calculationSpeedMs: 0, shortcuts: [], verifiableRollsEnabled: false });
  });
  it('falls back when shared metadata is malformed', () => {
    expect(readRoomSettings({ [ROOM_SETTINGS_KEY]: { calculationSpeedMs: -1, shortcuts: [{ label: '', term: 'd6' }] } })).toEqual(DEFAULT_ROOM_SETTINGS);
  });
});
