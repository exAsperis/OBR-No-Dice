import OBR from '@owlbear-rodeo/sdk';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { applyOwlbearTheme } from './theme';
import { isResult, type RollResult } from './protocol';
import { isLocalMessage, LOCAL_CHANNEL, REVEAL_POPOVER_ID, type LocalMessage } from './revealProtocol';
import { nextRevealCount, REVEAL_LINE_INTERVAL_MS, reductionDiff, revealLines } from './revealLines';
import type { Distribution } from './engine/probability';
import './reveal.css';

function RevealDistribution({ distribution, result, highlighted }: { distribution: Distribution; result: RollResult; highlighted: boolean }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const entries = useMemo(() => {
    if (distribution.entries.some(entry => JSON.stringify(entry.value) === JSON.stringify(result.value))) return distribution.entries;
    return [...distribution.entries, { value: result.value, probability: 0 }].sort((a, b) =>
      typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : String(a.value).localeCompare(String(b.value)));
  }, [distribution, result.value]);
  useEffect(() => {
    const container = scroller.current, surface = canvas.current;
    if (!container || !surface || !entries.length) return;
    const draw = () => {
      const width = Math.max(Math.ceil(container.clientWidth - 24), entries.length);
      const height = 52;
      surface.width = width;
      surface.height = height;
      surface.style.width = `${width}px`;
      const context = surface.getContext('2d');
      if (!context) return;
      const max = Math.max(...entries.map(entry => entry.probability));
      const barWidth = width / entries.length;
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const barHeight = Math.max(1, Math.round(entry.probability / max * height));
        context.fillStyle = highlighted && JSON.stringify(entry.value) === JSON.stringify(result.value) ? '#f3ac41' : '#a68bfa';
        const left = Math.round(index * barWidth), right = Math.round((index + 1) * barWidth);
        const top = height - barHeight;
        const radius = Math.min(2, (right - left) / 2, barHeight / 2);
        if (radius < 1) context.fillRect(left, top, right - left, barHeight);
        else {
          context.beginPath();
          context.moveTo(left, height);
          context.lineTo(left, top + radius);
          context.quadraticCurveTo(left, top, left + radius, top);
          context.lineTo(right - radius, top);
          context.quadraticCurveTo(right, top, right, top + radius);
          context.lineTo(right, height);
          context.closePath();
          context.fill();
        }
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [entries, result.value, highlighted]);
  return <div className="reveal-distribution" ref={scroller} role="img" aria-label={`${distribution.exact ? 'Exact' : 'Estimated'} distribution for ${result.expression}; ${highlighted ? `rolled ${Array.isArray(result.value) ? result.value.join(', ') : result.value}` : 'result pending'}`}><canvas ref={canvas} aria-hidden="true" /></div>;
}

function Reveal() {
  const [result, setResult] = useState<RollResult | null>(null);
  const [visibleCount, setVisibleCount] = useState(1);
  const [chart, setChart] = useState<{ requestId: string; distribution: Distribution } | null>(null);
  const [highlightedRequestId, setHighlightedRequestId] = useState<string | null>(null);
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
  useEffect(() => {
    if (!result || result.error) return;
    const worker = new Worker(new URL('./probability.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ result?: Distribution }>) => {
      if (event.data.result) setChart({ requestId: result.requestId, distribution: event.data.result });
    };
    worker.postMessage({ id: 1, expression: result.expression, dialect: result.dialect });
    return () => worker.terminate();
  }, [result]);
  const lines = useMemo(() => result ? revealLines(result) : [], [result]);
  const visible = lines.slice(0, visibleCount);
  const distribution = chart && chart.requestId === result?.requestId ? chart.distribution : null;
  useEffect(() => {
    if (!result || visibleCount < lines.length) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setHighlightedRequestId(result.requestId), reducedMotion ? 0 : 820);
    return () => window.clearTimeout(timer);
  }, [result, visibleCount, lines.length]);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [visibleCount, result]);

  function dismiss() {
    if (identity.current) channel.current?.postMessage({ type: 'dismiss', ...identity.current } satisfies LocalMessage);
    void OBR.popover.close(REVEAL_POPOVER_ID);
  }

  return <main className="reveal-shell" aria-label="Roll result">
    <header className="reveal-header"><div><strong>NO DICE</strong>{result&&<span>{result.playerName}</span>}</div><button type="button" onClick={dismiss} aria-label="Dismiss roll result">×</button></header>
    {result && distribution && distribution.entries.length > 0 && <RevealDistribution distribution={distribution} result={result} highlighted={highlightedRequestId === result.requestId} />}
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
