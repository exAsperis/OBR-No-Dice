import { useEffect, useRef, useState } from 'react';
import { useOwlbear } from './hooks/useOwlbear';
import { PANEL_CHANNEL, type PanelCommand } from './panelProtocol';
import { StatusPanel } from './components/StatusPanel';
import OBR from '@owlbear-rodeo/sdk';
import { DEFAULT_ROOM_SETTINGS, readRoomSettings } from './roomSettings';
import { railHeight, railViewport } from './railLayout';
import './rail.css';

export default function Rail() {
  const obr = useOwlbear();
  const channel = useRef<BroadcastChannel | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<readonly { label: string; term: string }[]>(DEFAULT_ROOM_SETTINGS.shortcuts);
  useEffect(() => {
    if (obr.status !== 'ready') return;
    let active = true;
    let changed = false;
    const unsubscribe = OBR.room.onMetadataChange(metadata => { changed = true; setShortcuts(readRoomSettings(metadata).shortcuts); });
    void OBR.room.getMetadata().then(metadata => { if (active && !changed) setShortcuts(readRoomSettings(metadata).shortcuts); }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [obr.status]);
  useEffect(() => {
    if (obr.status !== 'ready') return;
    let active = true;
    let lastHeight = 0;
    let sequence = 0;
    const resize = async () => {
      const current = ++sequence;
      const viewport = await railViewport(() => OBR.viewport.getHeight());
      if (!active || current !== sequence) return;
      const height = railHeight(shortcuts.length, viewport.height, viewport.top);
      if (height === lastHeight) return;
      try { await OBR.action.setHeight(height); lastHeight = height; } catch { /* Retry on the next viewport check. */ }
    };
    void resize();
    const onResize = () => void resize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    const timer = window.setInterval(onResize, 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [obr.status, shortcuts.length]);
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
    <div className="rail-slot"><button className="rail-open" type="button" onClick={() => send({ type: 'toggle' })} title={panelOpen ? 'Hide expression panel' : 'Show expression panel'} aria-expanded={panelOpen}>{panelOpen ? 'Hide' : 'Show'}</button></div>
    <div className="rail-shortcuts" role="group" aria-label="Dice shortcuts">
      {shortcuts.map((shortcut, index) => <div className="rail-slot" key={`${index}:${shortcut.label}`}><button type="button" onClick={() => send({ type: 'shortcut', term: shortcut.term, requestId: crypto.randomUUID() })} title={shortcut.term} aria-label={`Insert ${shortcut.label} (${shortcut.term})`}>{shortcut.label}</button></div>)}
    </div>
  </main>;
}
