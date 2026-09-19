import { usePlayerColor } from './usePlayerColor';

interface PlayerNameProps {
  roomId?: string;
  viewerId?: string;
  playerId: string;
  name: string;
}

export function PlayerName({ roomId, viewerId, playerId, name }: PlayerNameProps) {
  const color = usePlayerColor(roomId, viewerId, playerId);

  return <span className="player-name"><span className="player-color-disk" style={{ backgroundColor: color ?? 'var(--muted)' }} aria-hidden="true" />{name}</span>;
}
