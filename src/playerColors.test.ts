import { beforeEach, describe, expect, it } from 'vitest';
import {
  PlayerColorRegistry,
  getStoredPlayerColor,
  listStoredPlayerColors,
} from './playerColors';

describe('player color registry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists a newly observed player color', () => {
    const registry = new PlayerColorRegistry('room-a', 'viewer-a');

    expect(
      registry.remember(
        { id: 'joe', color: '#ff0000' },
        100,
      ),
    ).toBe(true);

    expect(
      getStoredPlayerColor('room-a', 'viewer-a', 'joe'),
    ).toEqual({
      playerId: 'joe',
      color: '#ff0000',
      updatedAt: 100,
    });
  });

  it('does not rewrite an unchanged color', () => {
    const registry = new PlayerColorRegistry('room-a', 'viewer-a');

    expect(
      registry.remember(
        { id: 'joe', color: '#ff0000' },
        100,
      ),
    ).toBe(true);

    expect(
      registry.remember(
        { id: 'joe', color: '#ff0000' },
        200,
      ),
    ).toBe(false);

    expect(
      getStoredPlayerColor('room-a', 'viewer-a', 'joe'),
    ).toEqual({
      playerId: 'joe',
      color: '#ff0000',
      updatedAt: 100,
    });
  });

  it('replaces a stale color when the player changes color', () => {
    const registry = new PlayerColorRegistry('room-a', 'viewer-a');

    registry.remember(
      { id: 'joe', color: '#ff0000' },
      100,
    );

    expect(
      registry.remember(
        { id: 'joe', color: '#0000ff' },
        200,
      ),
    ).toBe(true);

    expect(
      getStoredPlayerColor('room-a', 'viewer-a', 'joe'),
    ).toEqual({
      playerId: 'joe',
      color: '#0000ff',
      updatedAt: 200,
    });
  });

  it('persists multiple players', () => {
    const registry = new PlayerColorRegistry('room-a', 'viewer-a');

    registry.remember({ id: 'joe', color: '#111111' }, 100);
    registry.remember({ id: 'bill', color: '#222222' }, 200);
    registry.remember({ id: 'libby', color: '#333333' }, 300);

    expect(
      listStoredPlayerColors('room-a', 'viewer-a')
        .map(item => [item.playerId, item.color])
        .sort(),
    ).toEqual([
      ['bill', '#222222'],
      ['joe', '#111111'],
      ['libby', '#333333'],
    ]);
  });

  it('isolates colors by room and local viewer', () => {
    const first = new PlayerColorRegistry('room-a', 'viewer-a');
    const second = new PlayerColorRegistry('room-b', 'viewer-a');
    const third = new PlayerColorRegistry('room-a', 'viewer-b');

    first.remember({ id: 'joe', color: '#111111' }, 100);
    second.remember({ id: 'joe', color: '#222222' }, 200);
    third.remember({ id: 'joe', color: '#333333' }, 300);

    expect(
      getStoredPlayerColor('room-a', 'viewer-a', 'joe')?.color,
    ).toBe('#111111');

    expect(
      getStoredPlayerColor('room-b', 'viewer-a', 'joe')?.color,
    ).toBe('#222222');

    expect(
      getStoredPlayerColor('room-a', 'viewer-b', 'joe')?.color,
    ).toBe('#333333');
  });

  it('ignores unusable player/color data', () => {
    const registry = new PlayerColorRegistry('room-a', 'viewer-a');

    expect(registry.remember({ id: '', color: '#ffffff' })).toBe(false);
    expect(registry.remember({ id: 'joe', color: '' })).toBe(false);
    expect(registry.list()).toEqual([]);
  });

  it('loads existing colors when a new registry instance is created', () => {
    const first = new PlayerColorRegistry('room-a', 'viewer-a');
    first.remember({ id: 'joe', color: '#abcdef' }, 123);

    const second = new PlayerColorRegistry('room-a', 'viewer-a');

    expect(second.get('joe')).toEqual({
      playerId: 'joe',
      color: '#abcdef',
      updatedAt: 123,
    });
  });
});