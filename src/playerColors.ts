import { EXTENSION_ID } from './constants';

export interface PlayerColorSource {
  id: string;
  color: string;
}

export interface StoredPlayerColor {
  playerId: string;
  color: string;
  updatedAt: number;
}

export interface PlayerColorMessage {
  type: 'player-color';
  roomId: string;
  viewerId: string;
  playerId: string;
  color: string;
}

interface PersistedPlayerColors {
  version: 1;
  players: Record<string, {
    color: string;
    updatedAt: number;
  }>;
}

export const PLAYER_COLORS_CHANNEL =
  `${EXTENSION_ID}/player-colors-updated`;

const storageKey = (roomId: string, viewerId: string) =>
  `${EXTENSION_ID}/player-colors/${roomId}/${viewerId}`;

function readPersisted(
  roomId: string,
  viewerId: string,
): Map<string, StoredPlayerColor> {
  try {
    const raw = localStorage.getItem(storageKey(roomId, viewerId));
    if (!raw) return new Map();

    const parsed = JSON.parse(raw) as Partial<PersistedPlayerColors>;
    if (parsed.version !== 1 || !parsed.players || typeof parsed.players !== 'object') {
      return new Map();
    }

    const result = new Map<string, StoredPlayerColor>();

    for (const [playerId, value] of Object.entries(parsed.players)) {
      if (
        value &&
        typeof value.color === 'string' &&
        value.color.trim() &&
        Number.isFinite(value.updatedAt)
      ) {
        result.set(playerId, {
          playerId,
          color: value.color,
          updatedAt: value.updatedAt,
        });
      }
    }

    return result;
  } catch {
    return new Map();
  }
}

function writePersisted(
  roomId: string,
  viewerId: string,
  records: Map<string, StoredPlayerColor>,
): void {
  try {
    const players: PersistedPlayerColors['players'] = {};

    for (const record of records.values()) {
      players[record.playerId] = {
        color: record.color,
        updatedAt: record.updatedAt,
      };
    }

    localStorage.setItem(
      storageKey(roomId, viewerId),
      JSON.stringify({
        version: 1,
        players,
      } satisfies PersistedPlayerColors),
    );
  } catch {
    // Color history is useful presentation metadata, but failure to
    // persist it must never interfere with rolling or ledger storage.
  }
}

function announce(
  roomId: string,
  viewerId: string,
  record: StoredPlayerColor,
): void {
  if (typeof BroadcastChannel === 'undefined') return;

  try {
    const channel = new BroadcastChannel(PLAYER_COLORS_CHANNEL);

    channel.postMessage({
      type: 'player-color',
      roomId,
      viewerId,
      playerId: record.playerId,
      color: record.color,
    } satisfies PlayerColorMessage);

    channel.close();
  } catch {
    // Other views can still read the persisted registry when opened.
  }
}

export class PlayerColorRegistry {
  private readonly records: Map<string, StoredPlayerColor>;

  constructor(
    private readonly roomId: string,
    private readonly viewerId: string,
  ) {
    this.records = readPersisted(roomId, viewerId);
  }

  get(playerId: string): StoredPlayerColor | undefined {
    return this.records.get(playerId);
  }

  list(): StoredPlayerColor[] {
    return [...this.records.values()];
  }

  /**
   * Remember the latest OBR color for a player.
   *
   * Returns true only when the stored color actually changed.
   * Non-color player changes therefore cause no localStorage write.
   */
  remember(
    player: PlayerColorSource,
    updatedAt = Date.now(),
  ): boolean {
    if (
      typeof player.id !== 'string' ||
      !player.id ||
      typeof player.color !== 'string' ||
      !player.color.trim()
    ) {
      return false;
    }

    const current = this.records.get(player.id);

    if (current?.color === player.color) {
      return false;
    }

    const record: StoredPlayerColor = {
      playerId: player.id,
      color: player.color,
      updatedAt,
    };

    this.records.set(player.id, record);
    writePersisted(this.roomId, this.viewerId, this.records);
    announce(this.roomId, this.viewerId, record);

    return true;
  }
}

/**
 * Convenience reader for UI surfaces that do not need to mutate colors.
 */
export function getStoredPlayerColor(
  roomId: string,
  viewerId: string,
  playerId: string,
): StoredPlayerColor | undefined {
  return readPersisted(roomId, viewerId).get(playerId);
}

/**
 * Convenience reader for statistics and other multi-player views.
 */
export function listStoredPlayerColors(
  roomId: string,
  viewerId: string,
): StoredPlayerColor[] {
  return [...readPersisted(roomId, viewerId).values()];
}