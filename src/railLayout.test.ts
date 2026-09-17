import { describe, expect, it } from 'vitest';
import { railHeight, RAIL_BOTTOM_MARGIN, RAIL_ROW_HEIGHT } from './railLayout';

describe('button rail height', () => {
  it('fits its rows when there is room and shrinks when shortcuts are removed', () => {
    expect(railHeight(9, 900, 60)).toBe(10 * RAIL_ROW_HEIGHT);
    expect(railHeight(2, 900, 60)).toBe(3 * RAIL_ROW_HEIGHT);
  });
  it('uses the rail top to preserve the bottom margin', () => {
    const height = railHeight(30, 700, 120);
    expect(height).toBe(480);
    expect(120 + height + RAIL_BOTTOM_MARGIN).toBe(700);
  });
});
