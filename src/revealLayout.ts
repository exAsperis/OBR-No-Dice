import { EXTENSION_ID } from './constants';
import type { PanelPosition, PanelSize } from './panelLayout';

const key = (playerId: string) => `${EXTENSION_ID}/reveal-position/${playerId}`;

export function bottomRightPosition(viewport: PanelSize, panel: PanelSize): PanelPosition {
  return { left: Math.max(8, viewport.width - panel.width - 16), top: Math.max(8, viewport.height - panel.height - 16) };
}

export function fittedRevealPosition(saved: PanelPosition | null, viewport: PanelSize, panel: PanelSize): PanelPosition {
  if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)
    && saved.left >= 8 && saved.top >= 8
    && saved.left + panel.width <= viewport.width - 8
    && saved.top + panel.height <= viewport.height - 8) return saved;
  return bottomRightPosition(viewport, panel);
}

export function loadRevealPosition(playerId: string): PanelPosition | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(playerId)) ?? 'null') as PanelPosition | null;
    return value && Number.isFinite(value.left) && Number.isFinite(value.top) ? value : null;
  } catch { return null; }
}

export function saveRevealPosition(playerId: string, position: PanelPosition) {
  try { localStorage.setItem(key(playerId), JSON.stringify(position)); } catch { /* Storage may be unavailable. */ }
}
