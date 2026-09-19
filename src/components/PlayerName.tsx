import { useEffect, useState } from 'react';
import { getStoredPlayerColor, PLAYER_COLORS_CHANNEL } from '../playerColors';

interface PlayerNameProps {
  roomId?: string;
  viewerId?: string;
  playerId: string;
  name: string;
}

export function PlayerName({ roomId, viewerId, playerId, name }: PlayerNameProps) {
  const readColor = () => roomId && viewerId
    ? getStoredPlayerColor(roomId, viewerId, playerId)?.color
    : undefined;
  const [color, setColor] = useState(readColor);

  useEffect(() => {
    setColor(readColor());
    if (!roomId || !viewerId || typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(PLAYER_COLORS_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data as Partial<{
        type: string;
        roomId: string;
        viewerId: string;
        playerId: string;
        color: string;
      }>;
      if (
        message?.type === 'player-color' &&
        message.roomId === roomId &&
        message.viewerId === viewerId &&
        message.playerId === playerId
      ) {
        setColor(message.color);
      }
    };
    return () => channel.close();
  }, [roomId, viewerId, playerId]);

  return <span className="player-name"><span className="player-color-disk" style={{ backgroundColor: color ?? 'var(--muted)' }} aria-hidden="true" />{name}</span>;
}