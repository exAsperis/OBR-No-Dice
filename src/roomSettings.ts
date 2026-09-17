import { EXTENSION_ID } from './constants';
import { DICE_SHORTCUTS } from './shortcuts';
import { REVEAL_LINE_INTERVAL_MS } from './revealLines';

export const ROOM_SETTINGS_KEY = `${EXTENSION_ID}/room-settings`;
export interface Shortcut { label: string; term: string }
export interface RoomSettings { calculationSpeedMs: number; shortcuts: Shortcut[]; verifiableRollsEnabled: boolean }
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  calculationSpeedMs: REVEAL_LINE_INTERVAL_MS,
  verifiableRollsEnabled: false,
  shortcuts: DICE_SHORTCUTS.map(({ label, term }) => ({ label, term })),
};

export function readRoomSettings(metadata: Record<string, unknown>): RoomSettings {
  const raw = metadata[ROOM_SETTINGS_KEY];
  if (!raw || typeof raw !== 'object') return DEFAULT_ROOM_SETTINGS;
  const value = raw as Partial<RoomSettings>;
  const calculationSpeedMs = Number.isInteger(value.calculationSpeedMs) && value.calculationSpeedMs! >= 0 && value.calculationSpeedMs! <= 10000
    ? value.calculationSpeedMs! : DEFAULT_ROOM_SETTINGS.calculationSpeedMs;
  const shortcuts = Array.isArray(value.shortcuts) && value.shortcuts.length <= 30 && value.shortcuts.every(item =>
    item && typeof item.label === 'string' && item.label.trim().length > 0 && item.label.length <= 32
    && typeof item.term === 'string' && item.term.trim().length > 0 && item.term.length <= 200)
    ? value.shortcuts.map(item => ({ label: item.label.trim(), term: item.term.trim() }))
    : DEFAULT_ROOM_SETTINGS.shortcuts;
  return { calculationSpeedMs, shortcuts, verifiableRollsEnabled: value.verifiableRollsEnabled === true };
}
