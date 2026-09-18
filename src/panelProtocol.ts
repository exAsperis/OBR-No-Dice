import { EXTENSION_ID } from './constants';

export const PANEL_POPOVER_ID = `${EXTENSION_ID}/main-panel`;
export const PANEL_CHANNEL = `${EXTENSION_ID}/panel/v2`;

export type PanelCommand =
  | { type: 'open' }
  | { type: 'toggle' }
  | { type: 'state-request' }
  | { type: 'state'; open: boolean }
  | { type: 'shortcut'; term: string; requestId: string }
  | { type: 'apply-shortcut'; term: string; requestId: string }
  | { type: 'ready' }
  | { type: 'focus' }
  | { type: 'close' }
  | { type: 'statistics' }
  | { type: 'statistics-size'; maximized: boolean }
  | { type: 'statistics-close' }
  | { type: 'move'; dx: number; dy: number }
  | { type: 'resize'; height: number };
export type PanelMessage = { roomId: string; playerId: string } & PanelCommand;

export function isPanelMessage(value: unknown): value is PanelMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<PanelMessage>;
  return typeof message.roomId === 'string' && typeof message.playerId === 'string'
    && (message.type === 'open' || message.type === 'toggle' || message.type === 'state-request' || (message.type === 'state' && typeof message.open === 'boolean') || message.type === 'ready' || message.type === 'focus' || message.type === 'close' || message.type === 'statistics' || message.type === 'statistics-close' || (message.type === 'statistics-size' && typeof message.maximized === 'boolean')
      || ((message.type === 'shortcut' || message.type === 'apply-shortcut') && typeof message.term === 'string' && typeof message.requestId === 'string')
      || (message.type === 'move' && Number.isFinite(message.dx) && Number.isFinite(message.dy))
      || (message.type === 'resize' && Number.isFinite(message.height)));
}
