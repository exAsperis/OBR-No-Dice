import { EXTENSION_ID } from './constants';

export const PANEL_POPOVER_ID = `${EXTENSION_ID}/main-panel`;
export const PANEL_CHANNEL = `${EXTENSION_ID}/panel/v1`;

export type PanelCommand =
  | { type: 'open' }
  | { type: 'shortcut'; term: string }
  | { type: 'apply-shortcut'; term: string }
  | { type: 'ready' }
  | { type: 'focus' }
  | { type: 'close' }
  | { type: 'move'; dx: number; dy: number }
  | { type: 'resize'; height: number };
export type PanelMessage = { roomId: string; playerId: string } & PanelCommand;

export function isPanelMessage(value: unknown): value is PanelMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<PanelMessage>;
  return typeof message.roomId === 'string' && typeof message.playerId === 'string'
    && (message.type === 'open' || message.type === 'ready' || message.type === 'focus' || message.type === 'close'
      || ((message.type === 'shortcut' || message.type === 'apply-shortcut') && typeof message.term === 'string')
      || (message.type === 'move' && Number.isFinite(message.dx) && Number.isFinite(message.dy))
      || (message.type === 'resize' && Number.isFinite(message.height)));
}
