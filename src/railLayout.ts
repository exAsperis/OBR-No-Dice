export const RAIL_ROW_HEIGHT = 40;
export const RAIL_BOTTOM_MARGIN = 100;
export const RAIL_TOP_ALLOWANCE = 32;

export function railHeight(shortcutCount: number, viewportHeight: number, railTop: number): number {
  const contentHeight = (shortcutCount + 1) * RAIL_ROW_HEIGHT;
  const availableHeight = Math.floor(viewportHeight - railTop - RAIL_BOTTOM_MARGIN);
  return Math.max(RAIL_ROW_HEIGHT, Math.min(contentHeight, availableHeight));
}

/** Cross-origin Owlbear iframes cannot read frameElement; use the scene viewport as a conservative bound. */
export async function railViewport(getSceneHeight: () => Promise<number>): Promise<{ height: number; top: number }> {
  try {
    const frame = window.frameElement;
    const parentHeight = window.parent.innerHeight;
    if (frame && Number.isFinite(parentHeight) && parentHeight > 0) {
      return { height: parentHeight, top: frame.getBoundingClientRect().top };
    }
  } catch { /* Owlbear and the extension have different origins. */ }
  try {
    const height = await getSceneHeight();
    if (Number.isFinite(height) && height > 0) return { height, top: RAIL_TOP_ALLOWANCE };
  } catch { /* Use the browser screen as a last resort. */ }
  return { height: window.screen.availHeight, top: 160 };
}
