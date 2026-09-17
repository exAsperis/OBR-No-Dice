import { useEffect, useRef } from 'react';
import { useOwlbear } from './hooks/useOwlbear';
import { DICE_SHORTCUTS } from './shortcuts';
import { PANEL_CHANNEL, type PanelCommand } from './panelProtocol';
import { StatusPanel } from './components/StatusPanel';
import './rail.css';

export default function Rail() {
  const obr = useOwlbear();
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const local = new BroadcastChannel(PANEL_CHANNEL);
    channel.current = local;
    return () => { channel.current = null; local.close(); };
  }, []);
  function send(message: PanelCommand) {
    if (!obr.roomId || !obr.playerId) return;
    channel.current?.postMessage({ ...message, roomId: obr.roomId, playerId: obr.playerId });
  }
  if (obr.status === 'connecting') return <StatusPanel title="No Dice" message="Connecting…" />;
  if (obr.status === 'error') return <StatusPanel title="No Dice" message={obr.error ?? 'Unavailable'} onRetry={() => void obr.refresh()} />;
  return <main className="rail" aria-label="No Dice shortcuts">
    <button className="rail-open" type="button" onClick={() => send({ type: 'open' })} title="Open No Dice">Open</button>
    <div className="rail-shortcuts" role="group" aria-label="Dice shortcuts">
      {DICE_SHORTCUTS.map(shortcut => <button key={shortcut.label} type="button" onClick={() => send({ type: 'shortcut', term: shortcut.term })} title={shortcut.term} aria-label={`Insert ${shortcut.label} (${shortcut.term})`}>{shortcut.label}</button>)}
    </div>
  </main>;
}
