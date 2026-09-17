import { beforeEach, describe, expect, it } from 'vitest';
import { fittedRevealPosition, loadRevealPosition, saveRevealPosition } from './revealLayout';

describe('reveal placement', () => {
  beforeEach(() => localStorage.clear());
  const viewport = { width: 1200, height: 800 };
  const panel = { width: 390, height: 360 };

  it('starts at the bottom right and keeps a valid saved position', () => {
    expect(fittedRevealPosition(null, viewport, panel)).toEqual({ left: 794, top: 424 });
    saveRevealPosition('player', { left: 100, top: 80 });
    expect(fittedRevealPosition(loadRevealPosition('player'), viewport, panel)).toEqual({ left: 100, top: 80 });
  });

  it('returns an offscreen saved position to the bottom right', () => {
    expect(fittedRevealPosition({ left: 1000, top: 80 }, viewport, panel)).toEqual({ left: 794, top: 424 });
    expect(fittedRevealPosition({ left: 100, top: -10 }, viewport, panel)).toEqual({ left: 794, top: 424 });
  });

  it('stores positions separately by player', () => {
    saveRevealPosition('one', { left: 20, top: 30 });
    expect(loadRevealPosition('one')).toEqual({ left: 20, top: 30 });
    expect(loadRevealPosition('two')).toBeNull();
  });
});
