import { EXTENSION_ID } from './constants';
import { DICE_SHORTCUTS } from './shortcuts';
import { REVEAL_LINE_INTERVAL_MS } from './revealLines';
import { validDieOverride, type DieOverride } from './dieOverrides';
import type { DiceSession } from './sessionLedger';

export const ROOM_SETTINGS_KEY = `${EXTENSION_ID}/room-settings`;
export interface Shortcut { label: string; term: string }
export interface OverrideModeSettings { enabled: boolean; overrides: DieOverride[]; previousVerifiableRollsEnabled?: boolean; previousSession?: DiceSession; overrideSession?: DiceSession }
export interface RoomSettings { calculationSpeedMs: number; shortcuts: Shortcut[]; verifiableRollsEnabled: boolean; overrideMode?: OverrideModeSettings }
export const DEFAULT_OVERRIDE_MODE: OverrideModeSettings = { enabled: false, overrides: [] };
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  calculationSpeedMs: REVEAL_LINE_INTERVAL_MS,
  verifiableRollsEnabled: false,
  overrideMode: DEFAULT_OVERRIDE_MODE,
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
  const mode = value.overrideMode;
  const overrides = Array.isArray(mode?.overrides) && mode.overrides.length <= 30
    && mode.overrides.every(item => item && typeof item.die === 'string' && validDieOverride(item))
    && new Set(mode.overrides.map(item => item.die)).size === mode.overrides.length
    ? mode.overrides.map(item => ({die:item.die,value:item.value})) : [];
  const session = (candidate: unknown): DiceSession | undefined => {
    if (!candidate || typeof candidate !== 'object') return undefined;
    const item = candidate as Partial<DiceSession>;
    return typeof item.id === 'string' && item.id.length > 0 && typeof item.name === 'string'
      && Number.isFinite(item.startedAt) ? {id:item.id,name:item.name,startedAt:item.startedAt!,...(Number.isFinite(item.endedAt)?{endedAt:item.endedAt}:{}),...(item.kind === 'override' ? {kind:'override' as const} : {})} : undefined;
  };
  const previousSession = session(mode?.previousSession);
  const overrideSession = session(mode?.overrideSession);
  const enabled = mode?.enabled === true && previousSession !== undefined && previousSession.kind !== 'override'
    && overrideSession?.kind === 'override' && overrideSession.name === 'OVERRIDE'
    && overrideSession.id.startsWith('override-') && overrideSession.id !== previousSession.id;
  return { calculationSpeedMs, shortcuts, verifiableRollsEnabled: enabled ? false : value.verifiableRollsEnabled === true,
    overrideMode: {enabled,overrides,...(enabled ? {previousVerifiableRollsEnabled:mode?.previousVerifiableRollsEnabled === true,previousSession,overrideSession} : {})} };
}
