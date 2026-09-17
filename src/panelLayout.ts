import { EXTENSION_ID } from './constants';

export interface PanelPosition { left: number; top: number }
export interface PanelSize { width: number; height: number }
export const positionKey = (playerId: string) => `${EXTENSION_ID}/panel-position/${playerId}`;
export const collapseKey = (playerId: string) => `${EXTENSION_ID}/panel-collapse/${playerId}`;
export const draftKey = (roomId: string, playerId: string) => `${EXTENSION_ID}/panel-draft/${roomId}/${playerId}`;
export const heightKey = (playerId: string) => `${EXTENSION_ID}/panel-height/${playerId}`;
export interface CollapsedSections { distribution: boolean; recent: boolean; history: boolean }
export const DEFAULT_COLLAPSED: CollapsedSections = { distribution: false, recent: false, history: true };

export function loadCollapsed(playerId: string): CollapsedSections {
  try {
    const value = JSON.parse(localStorage.getItem(collapseKey(playerId)) ?? 'null');
    return value && typeof value === 'object'
      ? { distribution: Boolean(value.distribution), recent: Boolean(value.recent), history: Boolean(value.history) }
      : DEFAULT_COLLAPSED;
  } catch { return DEFAULT_COLLAPSED; }
}
export function saveCollapsed(playerId: string, collapsed: CollapsedSections) {
  try { localStorage.setItem(collapseKey(playerId), JSON.stringify(collapsed)); } catch { /* Storage may be unavailable. */ }
}
export function loadDraft(roomId: string, playerId: string): string | null {
  try { return localStorage.getItem(draftKey(roomId, playerId)); } catch { return null; }
}
export function saveDraft(roomId: string, playerId: string, expression: string) {
  try { localStorage.setItem(draftKey(roomId, playerId), expression); } catch { /* Storage may be unavailable. */ }
}
export function clearDraft(roomId: string, playerId: string) {
  try { localStorage.removeItem(draftKey(roomId, playerId)); } catch { /* Storage may be unavailable. */ }
}
export function loadHeight(playerId: string): number {
  try {
    const value = Number(localStorage.getItem(heightKey(playerId)));
    return Number.isFinite(value) && value >= 180 && value <= 2000 ? value : 440;
  } catch { return 440; }
}
export function saveHeight(playerId: string, height: number) {
  try { localStorage.setItem(heightKey(playerId), String(height)); } catch { /* Storage may be unavailable. */ }
}

export function fittedPosition(saved: PanelPosition | null, viewport: PanelSize, panel: PanelSize, margin = 8): PanelPosition {
  const availableWidth = Math.max(0, viewport.width - panel.width);
  const availableHeight = Math.max(0, viewport.height - panel.height);
  const center = { left: Math.round(availableWidth / 2), top: Math.round(availableHeight / 2) };
  if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)
    || saved.left < margin || saved.top < margin
    || saved.left + panel.width > viewport.width - margin
    || saved.top + panel.height > viewport.height - margin) return center;
  return saved;
}

export function loadPosition(playerId: string): PanelPosition | null {
  try {
    const value = JSON.parse(localStorage.getItem(positionKey(playerId)) ?? 'null') as PanelPosition | null;
    return value && Number.isFinite(value.left) && Number.isFinite(value.top) ? value : null;
  } catch { return null; }
}

export function savePosition(playerId: string, position: PanelPosition) {
  try { localStorage.setItem(positionKey(playerId), JSON.stringify(position)); } catch { /* Storage may be unavailable. */ }
}
