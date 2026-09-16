import OBR from '@owlbear-rodeo/sdk';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { applyOwlbearTheme } from './theme';
import { isResult, type RollResult } from './protocol';
import { isLocalMessage, LOCAL_CHANNEL, REVEAL_POPOVER_ID, type LocalMessage } from './revealProtocol';
import { nextRevealCount, REVEAL_LINE_INTERVAL_MS, reductionDiff, revealLines } from './revealLines';
import './reveal.css';

function Reveal() {
  const [result, setResult] = useState<RollResult | null>(null);
  const [visibleCount, setVisibleCount] = useState(1);
  const channel = useRef<BroadcastChannel | null>(null);
  const identity = useRef<{ roomId: string; playerId: string } | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cleanupTheme: (() => void) | undefined;
    OBR.onReady(async () => {
      identity.current = { roomId: OBR.room.id, playerId: OBR.player.id };
      try { applyOwlbearTheme(await OBR.theme.getTheme()); cleanupTheme = OBR.theme.onChange(applyOwlbearTheme); } catch { /* CSS fallback. */ }
      const local = new BroadcastChannel(LOCAL_CHANNEL);
      channel.current = local;
      local.onmessage = (event: MessageEvent<unknown>) => {
        if (!isLocalMessage(event.data) || event.data.type !== 'show' || !isResult(event.data.result)) return;
        if (event.data.roomId !== identity.current?.roomId || event.data.playerId !== identity.current.playerId) return;
        setVisibleCount(1);
        setResult(event.data.result);
      };
      local.postMessage({ type: 'ready', ...identity.current } satisfies LocalMessage);
    });
    return () => { cleanupTheme?.(); channel.current?.close(); channel.current = null; };
  }, []);

  useEffect(() => {
    if (!result) return;
    const total = revealLines(result).length;
    let shown = 1;
    const timer = window.setInterval(() => {
      shown = nextRevealCount(shown, total);
      setVisibleCount(shown);
      if (shown >= total) window.clearInterval(timer);
    }, REVEAL_LINE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [result]);
  const lines = useMemo(() => result ? revealLines(result) : [], [result]);
  const visible = lines.slice(0, visibleCount);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [visibleCount, result]);

  function dismiss() {
    if (identity.current) channel.current?.postMessage({ type: 'dismiss', ...identity.current } satisfies LocalMessage);
    void OBR.popover.close(REVEAL_POPOVER_ID);
  }

  return <main className="reveal-shell" aria-label="Roll result">
    <header className="reveal-header"><div><strong>NO DICE</strong>{result&&<span>{result.playerName}</span>}</div><button type="button" onClick={dismiss} aria-label="Dismiss roll result">×</button></header>
    <div className="reveal-lines" ref={list} aria-live="off">
      {visible.map((line, index) => {
        const previous = lines[index - 1]?.text;
        const change = previous === undefined ? null : line.final ? {prefix:'',removed:previous,added:line.text,suffix:''} : reductionDiff(previous, line.text);
        return <div key={`${result?.requestId}-${index}`} className={`reveal-line ${line.final ? 'reveal-final' : ''} ${index ? 'reveal-entering' : ''}`} style={change ? { '--from-width': `${Math.min(change.removed.length, 90)}ch`, '--to-width': `${Math.min(change.added.length, 90)}ch` } as CSSProperties : undefined}>
          {change ? <span className="reveal-transition" role={line.final ? 'status' : undefined} aria-label={line.final ? line.text : undefined}>
            <span>{change.prefix}</span>
            <span className="reveal-change"><span className="reveal-old-term" aria-hidden="true">{change.removed}</span><span className="reveal-new-term">{change.added}</span></span>
            <span>{change.suffix}</span>
          </span> : <span className="reveal-original">{line.text}</span>}
        </div>;
      })}
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Reveal />);
