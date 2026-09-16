import { EXTENSION_ID } from './constants';
import type { RollResult } from './protocol';

export const REVEAL_POPOVER_ID = `${EXTENSION_ID}/roll-reveal`;
export const LOCAL_CHANNEL = `${EXTENSION_ID}/local-reveal/v1`;
export type LocalMessage =
  | { type: 'result'; roomId: string; playerId: string; result: RollResult }
  | { type: 'show'; roomId: string; playerId: string; result: RollResult }
  | { type: 'ready'; roomId: string; playerId: string }
  | { type: 'dismiss'; roomId: string; playerId: string };

export const isLocalMessage = (value: unknown): value is LocalMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<LocalMessage>;
  return typeof message.type === 'string' && typeof message.roomId === 'string' && typeof message.playerId === 'string';
};
