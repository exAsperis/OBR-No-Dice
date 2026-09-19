import OBR from '@owlbear-rodeo/sdk';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { applyOwlbearTheme } from './theme';
import { EXTENSION_ID } from './constants';
import { isResult, type RollResult } from './protocol';
import { isLocalMessage, LOCAL_CHANNEL, REVEAL_POPOVER_ID, type LocalMessage } from './revealProtocol';
import { nextRevealCount, reductionDiff, revealLineExploded, revealLines } from './revealLines';
import { DEFAULT_ROOM_SETTINGS, readRoomSettings } from './roomSettings';
import type { Distribution } from './engine/probability';
import { Toggle } from './Toggle';
import { ResultDisplay } from './ResultDisplay';
import { WorkDieCell } from './WorkDraws';
import { getSessionRolls, normalizeExpression, readSharedSession, type StoredRoll } from './sessionLedger';
import type { RollMoment } from './rollMoments';
import { explosionColor, rarestTier, rarityColor, type RarityTier } from './rarity';
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
      const highlightColor = colors.getPropertyValue(result.overridden ? '--override-red' : result.verification?.state === 'verified' ? '--verified-gold' : '--result-blue').trim()
        || (result.overridden ? '#c93440' : result.verification?.state === 'verified' ? '#b88722' : '#4da3ff');
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
  const [dieRings,setDieRings]=useState<Array<{key:string;left:number;top:number;color:string;tier?:RarityTier}>>([]);
  const [rarityRing,setRarityRing]=useState<{key:string;left:number;top:number;tier:RarityTier}|null>(null);
  const [momentAnimatingRequestId,setMomentAnimatingRequestId]=useState<string|null>(null);
  const [momentFrameDoneRequestId,setMomentFrameDoneRequestId]=useState<string|null>(null);
  const [moments, setMoments] = useState<{requestId:string; items:RollMoment[]}>({requestId:'',items:[]});
  const channel = useRef<BroadcastChannel | null>(null);
  const identity = useRef<{ roomId: string; playerId: string } | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const shell = useRef<HTMLElement | null>(null);
  const pausedExplosionFrames=useRef(new Set<string>());
  const startedMomentFrames=useRef(new Set<string>());
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
        if (newResult) { setFinishedRequestId(null); setDieRings([]); setRarityRing(null); setMomentAnimatingRequestId(null); setMomentFrameDoneRequestId(null); pausedExplosionFrames.current.clear(); startedMomentFrames.current.clear(); }
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

  const lines = useMemo(() => result ? revealLines(result) : [], [result]);
  const currentMoments=moments.requestId===result?.requestId?moments.items:[];
  const dieMoments=currentMoments.filter(moment=>moment.type==='die-rarity');
  useEffect(() => {
    if (!result) return;
    if(result.resolution&&moments.requestId!==result.requestId)return;
    const total = revealLines(result).length;
    let shown = progress.current?.requestId === result.requestId ? progress.current.count : 1;
    if (shown >= total) return;
    if (calculationSpeedMs === 0) { progress.current = { requestId: result.requestId, count: total }; setVisibleCount(total); return; }
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setInterval(() => {
      const pauseKey=`${result.requestId}:${shown}`;
      const line=lines[shown-1];
      if(!reducedMotion&&revealLineExploded(line,result)&&!pausedExplosionFrames.current.has(pauseKey)){
        pausedExplosionFrames.current.add(pauseKey);
        return;
      }
      shown = nextRevealCount(shown, total);
      progress.current = { requestId: result.requestId, count: shown };
      setVisibleCount(shown);
      if (shown >= total) window.clearInterval(timer);
    }, calculationSpeedMs);
    return () => window.clearInterval(timer);
  }, [result, calculationSpeedMs,moments.requestId]);
  useEffect(() => {
    if (!result || result.error) return;
    const worker = new Worker(new URL('./probability.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ result?: Distribution }>) => {
      if (event.data.result) setChart({ requestId: result.requestId, distribution: event.data.result });
    };
    worker.postMessage({ id: 1, expression: result.expression, dialect: result.dialect });
    return () => worker.terminate();
  }, [result]);
  useEffect(() => {
    if (!result?.resolution || !identity.current) return;
    let active = true;
    const worker = new Worker(new URL('./moments.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{moments:[string,RollMoment[]][]}>) => {
      if (active) setMoments({requestId:result.requestId,items:new Map(event.data.moments).get(result.requestId)??[]});
    };
    void (async () => {
      const metadata = await OBR.room.getMetadata();
      const shared = readSharedSession(metadata);
      const {roomId,playerId} = identity.current!;
      const rolls = shared ? await getSessionRolls(roomId,playerId,shared.id) : [];
      if (!rolls.some(roll => roll.id === result.requestId)) rolls.push({
        id:result.requestId,sessionId:shared?.id??'',timestamp:result.time,rollerId:result.playerId,
        rollerName:result.playerName,expression:result.expression,normalizedExpression:normalizeExpression(result),
        finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result,
      } satisfies StoredRoll);
      if (active) worker.postMessage({id:1,rolls});
    })().catch(() => { if (active) worker.postMessage({id:1,rolls:[{id:result.requestId,sessionId:'',timestamp:result.time,rollerId:result.playerId,rollerName:result.playerName,expression:result.expression,normalizedExpression:normalizeExpression(result),finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result} satisfies StoredRoll]}); });
    return () => { active = false; worker.terminate(); };
  }, [result]);
  const visible = lines.slice(0, visibleCount);
  const resultTier=rarestTier(currentMoments.filter(moment=>moment.type==='result-rarity').map(moment=>moment.tier));
  const streakTier=rarestTier(currentMoments.filter(moment=>moment.type==='streak-rarity').map(moment=>moment.tier));
  const momentsReady=!result?.resolution||moments.requestId===result.requestId;
  useLayoutEffect(()=>{
    const surface=shell.current,current=list.current?.children.item(visibleCount-1);
    const line=lines[visibleCount-1];
    if(!surface||!current||!line?.drawIndices||!result||calculationSpeedMs===0||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const outer=surface.getBoundingClientRect();
    const rings=line.drawIndices.flatMap(index=>{
      const draw=result.resolution?.dice[index],moment=dieMoments.find(item=>item.drawIndex===index);
      if(!draw||(!draw.exploded&&!moment))return [];
      const badge=current.querySelector<HTMLElement>(`[data-draw-index="${index}"]`);
      if(!badge)return [];
      const source=badge.getBoundingClientRect();
      return [{key:`${result.requestId}:${visibleCount}:${index}`,left:source.left-outer.left+source.width/2,top:source.top-outer.top+source.height/2,color:draw.exploded?explosionColor(draw.explosionNumber??1):rarityColor(moment!.tier)!,...(moment?{tier:moment.tier}:{})}];
    });
    if(rings.length)setDieRings(rings);
  },[visibleCount,result,calculationSpeedMs,currentMoments,lines]);
  useLayoutEffect(()=>{
    if(!result||visibleCount<lines.length||!momentsReady||momentFrameDoneRequestId===result.requestId)return;
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(calculationSpeedMs===0||reducedMotion){setMomentFrameDoneRequestId(result.requestId);return;}
    if(finishedRequestId!==result.requestId)return;
    const hasMoment=resultTier!=='ordinary'||streakTier!=='ordinary';
    if(!hasMoment){setMomentFrameDoneRequestId(result.requestId);return;}
    if(startedMomentFrames.current.has(result.requestId))return;
    startedMomentFrames.current.add(result.requestId);
    setMomentAnimatingRequestId(result.requestId);
    if(resultTier!=='ordinary'){
      const surface=shell.current,pill=list.current?.lastElementChild?.querySelector<HTMLElement>('.roll-result-pill');
      if(surface&&pill){const outer=surface.getBoundingClientRect(),source=pill.getBoundingClientRect();setRarityRing({key:result.requestId,left:source.left-outer.left+source.width/2,top:source.top-outer.top+source.height/2,tier:resultTier});}
    }
    const timer=window.setTimeout(()=>{setMomentAnimatingRequestId(null);setRarityRing(null);setMomentFrameDoneRequestId(result.requestId);},calculationSpeedMs);
    return()=>window.clearTimeout(timer);
  },[result,visibleCount,lines.length,momentsReady,resultTier,streakTier,finishedRequestId,calculationSpeedMs,momentFrameDoneRequestId]);
  useEffect(() => {
    if (result && visibleCount >= lines.length && identity.current
      && momentFrameDoneRequestId===result.requestId
      && (calculationSpeedMs === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches || finishedRequestId === result.requestId))
      channel.current?.postMessage({ type: 'revealed', ...identity.current, result } satisfies LocalMessage);
  }, [result, visibleCount, lines.length, calculationSpeedMs, finishedRequestId,momentFrameDoneRequestId]);
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
    if (!autoDismiss || !result || rerolling || visibleCount < lines.length||momentFrameDoneRequestId!==result.requestId) { setDismissTiming(null); return; }
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
  }, [autoDismiss, dismissSeconds, result, rerolling, visibleCount, lines.length,momentFrameDoneRequestId]);

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

  return <main ref={shell} className={`reveal-shell${calculationSpeedMs === 0 ? ' instant' : ''}`} style={{'--ring-duration':`${calculationSpeedMs||220}ms`} as CSSProperties} aria-label="Roll result">
    <div key={autoDismiss && dismissTiming ? `${dismissTiming.requestId}:${dismissTiming.deadline}` : `waiting:${result?.requestId}`} className={'dismiss-curtain'+(autoDismiss && dismissTiming?' running':'')} style={autoDismiss && dismissTiming ? { '--drain-duration': `${dismissTiming.remainingMs}ms`, '--drain-start': dismissTiming.startScale } as CSSProperties : undefined} aria-hidden="true"/>
    {dieRings.map(ring=><span key={ring.key} className={`reveal-die-ring${ring.tier?` rarity-${ring.tier}`:''}`} style={{'--ring-left':`${ring.left}px`,'--ring-top':`${ring.top}px`,'--rarity-color':ring.color} as CSSProperties} onAnimationEnd={()=>setDieRings(current=>current.filter(item=>item.key!==ring.key))} aria-hidden="true"/>)}
    {rarityRing&&<span key={rarityRing.key} className={`reveal-rarity-ring rarity-${rarityRing.tier}`} style={{'--ring-left':`${rarityRing.left}px`,'--ring-top':`${rarityRing.top}px`,'--rarity-color':rarityColor(rarityRing.tier)} as CSSProperties} aria-hidden="true"/>}
    <header className="reveal-header" onPointerDown={event=>{if((event.target as HTMLElement).closest('button'))return;dragStart.current={x:event.screenX,y:event.screenY};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerUp={event=>{const start=dragStart.current;dragStart.current=null;if(start&&identity.current){const dx=event.screenX-start.x,dy=event.screenY-start.y;if(Math.abs(dx)+Math.abs(dy)>5)channel.current?.postMessage({type:'move',...identity.current,dx,dy,visibleCount,highlighted:highlightedRequestId===result?.requestId,dismissDeadline:dismissTiming?.deadline} satisfies LocalMessage);}}} onPointerCancel={()=>{dragStart.current=null;}}><div><strong>NO DICE</strong>{result&&<span>{result.playerName}</span>}</div><button type="button" onClick={dismiss} aria-label="Dismiss roll result">×</button></header>
    <div className="reveal-controls"><button type="button" onClick={reroll} disabled={!result || rerolling}>{rerolling ? 'Rolling…' : 'Reroll'}</button><Toggle checked={autoDismiss} onChange={enabled => { setAutoDismiss(enabled); localStorage.setItem(DISMISS_ENABLED_KEY, String(enabled)); }}>Auto-dismiss</Toggle><label htmlFor="dismiss-seconds">Seconds</label><input id="dismiss-seconds" type="number" min="1" max="3600" step="1" value={dismissSeconds} disabled={!autoDismiss} onChange={event => { const seconds = Number(event.target.value); if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return; setDismissSeconds(seconds); localStorage.setItem(DISMISS_SECONDS_KEY, String(seconds)); }} /></div>
    {rerollError && <div className="reveal-error" role="alert">{rerollError}</div>}
    {result && distribution && distribution.entries.length > 0 && <RevealDistribution distribution={distribution} result={result} highlighted={highlightedRequestId === result.requestId} />}
    <div className="reveal-lines" ref={list} aria-live="off">
      {visible.map((line, index) => {
        const previous = lines[index - 1]?.text;
        const change = previous === undefined ? null : line.final ? {prefix:'',removed:previous,added:line.text,suffix:''} : reductionDiff(previous, line.text);
        const streakAnimating=line.final&&result&&momentAnimatingRequestId===result.requestId&&streakTier!=='ordinary';
        return <div key={`${result?.requestId}-${index}`} className={`reveal-line ${line.final ? 'reveal-final' : ''} ${index ? 'reveal-entering' : ''}${streakAnimating?` streak-sweeping rarity-${streakTier}`:''}`} onAnimationEnd={line.final ? event => { if (event.target === event.currentTarget && event.animationName === 'reveal-drop') setFinishedRequestId(result!.requestId); } : undefined} style={{...(change?{ '--from-width': `${Math.min(change.removed.length, 90)}ch`, '--to-width': `${Math.min(change.added.length, 90)}ch` }:{}),...(streakAnimating?{'--rarity-color':rarityColor(streakTier)}:{})} as CSSProperties}>
          {line.final && result ? <>{streakAnimating&&<span className="reveal-streak-sweep" aria-hidden="true"/>}<ResultDisplay result={result} moments={currentMoments} announce/></> : <><span className="reveal-work-left">{result&&<WorkDieCell die={line.die} result={result} indices={line.drawIndices} moments={dieMoments}/>}</span><span className="reveal-work-center">{change ? <span className="reveal-transition">
            <span>{change.prefix}</span>
            <span className="reveal-change"><span className="reveal-old-term" aria-hidden="true">{change.removed}</span><span className="reveal-new-term">{change.added}</span></span>
            <span>{change.suffix}</span>
          </span> : <span className="reveal-original">{line.text}</span>}</span><span aria-hidden="true"/></>}
        </div>;
      })}
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Reveal />);
