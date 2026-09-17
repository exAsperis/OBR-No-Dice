import { useEffect, useRef, useState } from 'react';
import { useOwlbear } from './hooks/useOwlbear';
import { DICE_SHORTCUTS } from './shortcuts';
import { PANEL_CHANNEL, type PanelCommand } from './panelProtocol';
import { StatusPanel } from './components/StatusPanel';
import './rail.css';

export default function Rail() {
  const obr = useOwlbear();
  const channel = useRef<BroadcastChannel | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => {
    const local = new BroadcastChannel(PANEL_CHANNEL);
    channel.current = local;
    local.onmessage = event => {
      if (event.data?.type === 'state' && event.data.roomId === obr.roomId && event.data.playerId === obr.playerId) setPanelOpen(event.data.open);
    };
    if (obr.roomId && obr.playerId) local.postMessage({ type: 'state-request', roomId: obr.roomId, playerId: obr.playerId });
    return () => { channel.current = null; local.close(); };
  }, [obr.roomId, obr.playerId]);
  function send(message: PanelCommand) {
    if (!obr.roomId || !obr.playerId) return;
    channel.current?.postMessage({ ...message, roomId: obr.roomId, playerId: obr.playerId });
  }
  if (obr.status === 'connecting') return <StatusPanel title="No Dice" message="Connecting…" />;
  if (obr.status === 'error') return <StatusPanel title="No Dice" message={obr.error ?? 'Unavailable'} onRetry={() => void obr.refresh()} />;
  return <main className="rail" aria-label="No Dice shortcuts">
    <div className="rail-slot"><button className="rail-open" type="button" onClick={() => send({ type: 'toggle' })} title={panelOpen ? 'Close No Dice' : 'Open No Dice'} aria-expanded={panelOpen}>{panelOpen ? 'Close' : 'Open'}</button></div>
    <div className="rail-shortcuts" role="group" aria-label="Dice shortcuts">
      {DICE_SHORTCUTS.map(shortcut => <div className="rail-slot" key={shortcut.label}><button type="button" onClick={() => send({ type: 'shortcut', term: shortcut.term, requestId: crypto.randomUUID() })} title={shortcut.term} aria-label={`Insert ${shortcut.label} (${shortcut.term})`}>{shortcut.label}</button></div>)}
    </div>
  </main>;
}
