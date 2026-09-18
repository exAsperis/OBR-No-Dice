import OBR from '@owlbear-rodeo/sdk';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { applyOwlbearTheme } from './theme';
import { EXTENSION_ID } from './constants';
import { isResult, type RollResult } from './protocol';
import { isLocalMessage, LOCAL_CHANNEL, REVEAL_POPOVER_ID, type LocalMessage } from './revealProtocol';
import { nextRevealCount, reductionDiff, revealLines } from './revealLines';
import { DEFAULT_ROOM_SETTINGS, readRoomSettings } from './roomSettings';
import type { Distribution } from './engine/probability';
import { Toggle } from './Toggle';
import { ResultDisplay } from './ResultDisplay';
import './reveal.css';

const DISMISS_ENABLED_KEY = `${EXTENSION_ID}/reveal-auto-dismiss`;
const DISMISS_SECONDS_KEY = `${EXTENSION_ID}/reveal-auto-dismiss-seconds`;
const readSeconds = () => {
  const value = Number(localStorage.getItem(DISMISS_SECONDS_KEY));
  return Number.isInteger(value) && value >= 1 && value <= 3600 ? value : 10;
};

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
      const colors = getComputedStyle(container);
      const normalColor = colors.getPropertyValue('--accent').trim() || '#a68bfa';
      const highlightColor = colors.getPropertyValue(result.verification?.state === 'verified' ? '--verified-gold' : '--result-blue').trim()
        || (result.verification?.state === 'verified' ? '#b88722' : '#4da3ff');
      const max = Math.max(...entries.map(entry => entry.probability));
      const barWidth = width / entries.length;
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const barHeight = Math.max(1, Math.round(entry.probability / max * height));
        context.fillStyle = highlighted && JSON.stringify(entry.value) === JSON.stringify(result.value) ? highlightColor : normalColor;
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
    const themeObserver = new MutationObserver(draw);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    return () => { observer.disconnect(); themeObserver.disconnect(); };
  }, [entries, result.value, result.verification?.state, highlighted]);
  return <div className="reveal-distribution" ref={scroller} role="img" aria-label={`${distribution.exact ? 'Exact' : 'Estimated'} distribution for ${result.expression}; ${highlighted ? `rolled ${Array.isArray(result.value) ? result.value.join(', ') : result.value}` : 'result pending'}`}><canvas ref={canvas} aria-hidden="true" /></div>;
}

function Reveal() {
  const [result, setResult] = useState<RollResult | null>(null);
  const [visibleCount, setVisibleCount] = useState(1);
  const [chart, setChart] = useState<{ requestId: string; distribution: Distribution } | null>(null);
  const [highlightedRequestId, setHighlightedRequestId] = useState<string | null>(null);
  const [autoDismiss, setAutoDismiss] = useState(() => localStorage.getItem(DISMISS_ENABLED_KEY) === 'true');
  const [dismissSeconds, setDismissSeconds] = useState(readSeconds);
  const [rerolling, setRerolling] = useState(false);
  const [rerollError, setRerollError] = useState('');
  const [dismissTiming, setDismissTiming] = useState<{ requestId: string; deadline: number; remainingMs: number; startScale: number } | null>(null);
  const [calculationSpeedMs, setCalculationSpeedMs] = useState(DEFAULT_ROOM_SETTINGS.calculationSpeedMs);
  const [finishedRequestId, setFinishedRequestId] = useState<string | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const identity = useRef<{ roomId: string; playerId: string } | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const progress = useRef<{ requestId: string; count: number } | null>(null);
  const resumeDeadline = useRef<number | null>(null);

  useEffect(() => {
    let cleanupTheme: (() => void) | undefined;
    let cleanupSettings: (() => void) | undefined;
    let active = true;
    OBR.onReady(async () => {
      if (!active) return;
      identity.current = { roomId: OBR.room.id, playerId: OBR.player.id };
      try { applyOwlbearTheme(await OBR.theme.getTheme()); cleanupTheme = OBR.theme.onChange(applyOwlbearTheme); } catch { /* CSS fallback. */ }
      try {
        let changed = false;
        cleanupSettings = OBR.room.onMetadataChange(metadata => { changed = true; setCalculationSpeedMs(readRoomSettings(metadata).calculationSpeedMs); });
        const metadata = await OBR.room.getMetadata();
        if (active && !changed) setCalculationSpeedMs(readRoomSettings(metadata).calculationSpeedMs);
      } catch { /* Default pace remains usable. */ }
      if (!active) return;
      const local = new BroadcastChannel(LOCAL_CHANNEL);
      channel.current = local;
      local.onmessage = (event: MessageEvent<unknown>) => {
        if (!isLocalMessage(event.data)) return;
        if (event.data.roomId !== identity.current?.roomId || event.data.playerId !== identity.current.playerId) return;
        if (event.data.type === 'reroll-error') { setRerolling(false); setRerollError(event.data.message); return; }
        if (event.data.type !== 'show' || !isResult(event.data.result)) return;
        const total=revealLines(event.data.result).length;
        const resumed=Math.max(1,Math.min(total,event.data.resume?.visibleCount??1));
        const newResult=event.data.result.requestId!==progress.current?.requestId;
        progress.current={requestId:event.data.result.requestId,count:resumed};
        resumeDeadline.current=Number.isFinite(event.data.resume?.dismissDeadline) ? event.data.resume!.dismissDeadline! : null;
        setDismissTiming(null);
        if (newResult) setFinishedRequestId(null);
        setVisibleCount(resumed);
        setHighlightedRequestId(event.data.resume?.highlighted?event.data.result.requestId:null);
        setRerolling(false);
        setRerollError('');
        setResult(event.data.result);
      };
      local.postMessage({ type: 'ready', ...identity.current } satisfies LocalMessage);
    });
    return () => { active = false; cleanupTheme?.(); cleanupSettings?.(); channel.current?.close(); channel.current = null; };
  }, []);

  useEffect(() => {
    if (!result) return;
    const total = revealLines(result).length;
    let shown = progress.current?.requestId === result.requestId ? progress.current.count : 1;
    if (shown >= total) return;
    if (calculationSpeedMs === 0) { progress.current = { requestId: result.requestId, count: total }; setVisibleCount(total); return; }
    const timer = window.setInterval(() => {
      shown = nextRevealCount(shown, total);
      progress.current = { requestId: result.requestId, count: shown };
      setVisibleCount(shown);
      if (shown >= total) window.clearInterval(timer);
    }, calculationSpeedMs);
    return () => window.clearInterval(timer);
  }, [result, calculationSpeedMs]);
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
  useEffect(() => {
    if (result && visibleCount >= lines.length && identity.current
      && (calculationSpeedMs === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches || finishedRequestId === result.requestId))
      channel.current?.postMessage({ type: 'revealed', ...identity.current, result } satisfies LocalMessage);
  }, [result, visibleCount, lines.length, calculationSpeedMs, finishedRequestId]);
  const distribution = chart && chart.requestId === result?.requestId ? chart.distribution : null;
  useEffect(() => {
    if (!result || visibleCount < lines.length) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setHighlightedRequestId(result.requestId), reducedMotion || calculationSpeedMs === 0 ? 0 : 820);
    return () => window.clearTimeout(timer);
  }, [result, visibleCount, lines.length, calculationSpeedMs]);
  useLayoutEffect(() => {
    const scroller = list.current;
    if (!scroller) return;
    const scrollToBottom = () => { scroller.scrollTop = scroller.scrollHeight; };
    scrollToBottom();
    const observer = new ResizeObserver(scrollToBottom);
    observer.observe(scroller);
    if (scroller.lastElementChild) observer.observe(scroller.lastElementChild);
    return () => observer.disconnect();
  }, [visibleCount, result, distribution]);
  useEffect(() => {
    if (!autoDismiss || !result || rerolling || visibleCount < lines.length) { setDismissTiming(null); return; }
    const requestId = result.requestId;
    const durationMs = dismissSeconds * 1000;
    const now = Date.now();
    const deadline = resumeDeadline.current ?? now + durationMs;
    resumeDeadline.current = null;
    const remainingMs = Math.max(0, deadline - now);
    setDismissTiming({ requestId, deadline, remainingMs, startScale: Math.min(1, remainingMs / durationMs) });
    const timer = window.setTimeout(() => {
      if (identity.current && result.requestId === requestId) dismiss();
    }, remainingMs);
    return () => window.clearTimeout(timer);
  }, [autoDismiss, dismissSeconds, result, rerolling, visibleCount, lines.length]);

  function dismiss() {
    if (identity.current) channel.current?.postMessage({ type: 'dismiss', ...identity.current } satisfies LocalMessage);
    void OBR.popover.close(REVEAL_POPOVER_ID);
  }
  function reroll() {
    if (!result || !identity.current || rerolling) return;
    setRerolling(true);
    setRerollError('');
    channel.current?.postMessage({ type: 'reroll', ...identity.current, requestId: result.requestId } satisfies LocalMessage);
  }

  return <main className={`reveal-shell${calculationSpeedMs === 0 ? ' instant' : ''}`} aria-label="Roll result">
    <div key={autoDismiss && dismissTiming ? `${dismissTiming.requestId}:${dismissTiming.deadline}` : `waiting:${result?.requestId}`} className={'dismiss-curtain'+(autoDismiss && dismissTiming?' running':'')} style={autoDismiss && dismissTiming ? { '--drain-duration': `${dismissTiming.remainingMs}ms`, '--drain-start': dismissTiming.startScale } as CSSProperties : undefined} aria-hidden="true"/>
    <header className="reveal-header" onPointerDown={event=>{if((event.target as HTMLElement).closest('button'))return;dragStart.current={x:event.screenX,y:event.screenY};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerUp={event=>{const start=dragStart.current;dragStart.current=null;if(start&&identity.current){const dx=event.screenX-start.x,dy=event.screenY-start.y;if(Math.abs(dx)+Math.abs(dy)>5)channel.current?.postMessage({type:'move',...identity.current,dx,dy,visibleCount,highlighted:highlightedRequestId===result?.requestId,dismissDeadline:dismissTiming?.deadline} satisfies LocalMessage);}}} onPointerCancel={()=>{dragStart.current=null;}}><div><strong>NO DICE</strong>{result&&<span>{result.playerName}</span>}</div><button type="button" onClick={dismiss} aria-label="Dismiss roll result">×</button></header>
    <div className="reveal-controls"><button type="button" onClick={reroll} disabled={!result || rerolling}>{rerolling ? 'Rolling…' : 'Reroll'}</button><Toggle checked={autoDismiss} onChange={enabled => { setAutoDismiss(enabled); localStorage.setItem(DISMISS_ENABLED_KEY, String(enabled)); }}>Auto-dismiss</Toggle><label htmlFor="dismiss-seconds">Seconds</label><input id="dismiss-seconds" type="number" min="1" max="3600" step="1" value={dismissSeconds} disabled={!autoDismiss} onChange={event => { const seconds = Number(event.target.value); if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return; setDismissSeconds(seconds); localStorage.setItem(DISMISS_SECONDS_KEY, String(seconds)); }} /></div>
    {rerollError && <div className="reveal-error" role="alert">{rerollError}</div>}
    {result && distribution && distribution.entries.length > 0 && <RevealDistribution distribution={distribution} result={result} highlighted={highlightedRequestId === result.requestId} />}
    <div className="reveal-lines" ref={list} aria-live="off">
      {visible.map((line, index) => {
        const previous = lines[index - 1]?.text;
        const change = previous === undefined ? null : line.final ? {prefix:'',removed:previous,added:line.text,suffix:''} : reductionDiff(previous, line.text);
        return <div key={`${result?.requestId}-${index}`} className={`reveal-line ${line.final ? 'reveal-final' : ''} ${index ? 'reveal-entering' : ''}`} onAnimationEnd={line.final ? event => { if (event.target === event.currentTarget && event.animationName === 'reveal-drop') setFinishedRequestId(result!.requestId); } : undefined} style={change ? { '--from-width': `${Math.min(change.removed.length, 90)}ch`, '--to-width': `${Math.min(change.added.length, 90)}ch` } as CSSProperties : undefined}>
          {line.final && result ? <ResultDisplay result={result} announce/> : change ? <span className="reveal-transition">
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
