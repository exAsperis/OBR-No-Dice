import OBR from '@owlbear-rodeo/sdk';
import { useEffect, useRef, useState } from 'react';
import { StatusPanel } from './components/StatusPanel';
import type { Value } from './engine/evaluate';
import type { Dialect } from './engine/ast';
import type { Distribution } from './engine/probability';
import type { FairnessSnapshot } from './engine/fairness';
import { useOwlbear } from './hooks/useOwlbear';
import { loadHistory, saveHistory } from './persistence';
import { encryptForGm } from './gmCrypto';
import { GM_CHANNEL, isRequest, isResult, REQUEST_CHANNEL, RESULT_CHANNEL, type RollRequest, type RollResult, type Visibility } from './protocol';
import { isLocalMessage, LOCAL_CHANNEL, type LocalMessage } from './revealProtocol';
import { displayValue, rollExpression } from './rollService';
import { applyDiceShortcutOnce } from './shortcuts';
import { PANEL_CHANNEL, isPanelMessage, type PanelCommand, type PanelMessage } from './panelProtocol';
import { DEFAULT_COLLAPSED, loadCollapsed, loadDraft, saveCollapsed, saveDraft } from './panelLayout';
import { RELEASE_VERSION } from './version';
import { DEFAULT_ROOM_SETTINGS, readRoomSettings, type RoomSettings } from './roomSettings';
import { GMSettings } from './GMSettings';

const display=displayValue;
const MAX_VISIBLE_BARS=200;
export default function App() {
  const obr=useOwlbear();
  const [expression,setExpression]=useState('');
  const [dialectHint,setDialectHint]=useState<Dialect|undefined>(undefined);
  const [detectedDialect,setDetectedDialect]=useState<Dialect|undefined>(undefined);
  const [visibility,setVisibility]=useState<Visibility>('everyone');
  const [history,setHistory]=useState<RollResult[]>([]);
  const [chart,setChart]=useState<Distribution|null>(null);
  const [chartError,setChartError]=useState('');
  const [fairness,setFairness]=useState<FairnessSnapshot|null>(null);
  const [fairnessRunning,setFairnessRunning]=useState(false);
  const [fairnessError,setFairnessError]=useState('');
  const [notation,setNotation]=useState<{short:string;longReadable:string;longExpanded:string}|null>(null);
  const [inputError,setInputError]=useState('');
  const [selected,setSelected]=useState<RollResult|null>(null);
  const [chartRolls,setChartRolls]=useState<Value[]>([]);
  const [busy,setBusy]=useState(false);
  const [roomSettings,setRoomSettings]=useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [collapsed,setCollapsed]=useState(DEFAULT_COLLAPSED);
  const [preferencesReady,setPreferencesReady]=useState(false);
  const panelChannel=useRef<BroadcastChannel|null>(null);
  const panelRef=useRef<HTMLElement|null>(null);
  const historyPreviewRef=useRef<HTMLSpanElement|null>(null);
  const [historyPreviewCount,setHistoryPreviewCount]=useState(Number.POSITIVE_INFINITY);
  const dragStart=useRef<{x:number;y:number}|null>(null);
  const seenShortcutIds=useRef(new Set<string>());
  const worker=useRef<Worker|null>(null);
  const fairnessWorker=useRef<Worker|null>(null);
  const fairnessId=useRef(0);
  const revealChannel=useRef<BroadcastChannel|null>(null);
  const sequence=useRef(0);
  const historyRef=useRef<RollResult[]>([]);
  const pendingLocalRolls=useRef(new Set<string>());
  const inputRef=useRef<HTMLInputElement|null>(null);
  const currentInput=useRef({expression,dialect:detectedDialect});
  currentInput.current={expression,dialect:detectedDialect};
  useEffect(()=>{
    if(!obr.roomId||!obr.playerId)return;
    if(new URLSearchParams(window.location.search).get('resume')==='1'){
      const saved=loadDraft(obr.roomId,obr.playerId);
      if(saved!==null)setExpression(saved);
    }
    setCollapsed(loadCollapsed(obr.playerId));
    setPreferencesReady(true);
  },[obr.roomId,obr.playerId]);
  useEffect(()=>{
    if(!preferencesReady||!obr.roomId||!obr.playerId)return;
    saveDraft(obr.roomId,obr.playerId,expression);
  },[expression,preferencesReady,obr.roomId,obr.playerId]);
  useEffect(()=>{
    if(!preferencesReady||!obr.playerId)return;
    saveCollapsed(obr.playerId,collapsed);
  },[collapsed,preferencesReady,obr.playerId]);
  useEffect(()=>{
    if(!preferencesReady||!obr.roomId||!obr.playerId)return;
    const channel=new BroadcastChannel(PANEL_CHANNEL);
    panelChannel.current=channel;
    channel.onmessage=(event:MessageEvent<unknown>)=>{
      if(!isPanelMessage(event.data)||event.data.roomId!==obr.roomId||event.data.playerId!==obr.playerId)return;
      if(event.data.type==='apply-shortcut')useShortcut(event.data.term,event.data.requestId);
      if(event.data.type==='focus')requestAnimationFrame(()=>inputRef.current?.focus());
    };
    channel.postMessage({type:'ready',roomId:obr.roomId,playerId:obr.playerId} satisfies PanelMessage);
    return ()=>{channel.close();panelChannel.current=null;};
  // The shortcut handler updates current React state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[obr.roomId,obr.playerId,preferencesReady]);
  useEffect(()=>{
    if(obr.status!=='ready')return;
    let active=true;
    let changed=false;
    const unsubscribe=OBR.room.onMetadataChange(metadata=>{changed=true;setRoomSettings(readRoomSettings(metadata));});
    void OBR.room.getMetadata().then(metadata=>{if(active&&!changed)setRoomSettings(readRoomSettings(metadata));}).catch(()=>{});
    return ()=>{active=false;unsubscribe();};
  },[obr.status]);
  useEffect(()=>{
    if(!preferencesReady||!obr.roomId||!obr.playerId||!panelRef.current)return;
    const panel=panelRef.current;
    const roomId=obr.roomId, playerId=obr.playerId;
    let frame=0;
    let lastHeight=0;
    const measure=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const height=Math.ceil(panel.getBoundingClientRect().height);
        if(height>0&&Math.abs(height-lastHeight)>=2){
          lastHeight=height;
          panelChannel.current?.postMessage({type:'resize',roomId,playerId,height} satisfies PanelMessage);
        }
      });
    };
    const observer=new ResizeObserver(measure);
    observer.observe(panel);
    measure();
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();};
  },[preferencesReady,obr.roomId,obr.playerId]);
  const add=(result:RollResult)=>{ if(historyRef.current.some(x=>x.requestId===result.requestId)) return; const next=[...historyRef.current,result].slice(-100); historyRef.current=next; setHistory(next); if(!result.error&&result.expression===currentInput.current.expression&&result.dialect===currentInput.current.dialect)setChartRolls(previous=>[...previous,result.value]); };
  useEffect(()=>{ if(!obr.roomId||!obr.playerId)return; const stored=loadHistory(obr.roomId,obr.playerId); historyRef.current=stored; setHistory(stored); },[obr.roomId,obr.playerId]);
  useEffect(()=>{ if(obr.roomId&&obr.playerId)saveHistory(obr.roomId,obr.playerId,history); },[history,obr.roomId,obr.playerId]);
  useEffect(()=>{
    if(!obr.roomId||!obr.playerId)return;
    const channel=new BroadcastChannel(LOCAL_CHANNEL);revealChannel.current=channel;
    channel.onmessage=(event:MessageEvent<unknown>)=>{
      if(!isLocalMessage(event.data)||event.data.type!=='revealed'||!isResult(event.data.result))return;
      if(event.data.roomId===obr.roomId&&event.data.playerId===obr.playerId){
        add(event.data.result);
        if(pendingLocalRolls.current.delete(event.data.result.requestId)){setSelected(event.data.result);setInputError('');}
      }
    };
    return ()=>{channel.close();revealChannel.current=null;};
  // The listener uses refs and functional state updates to process current results.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[obr.roomId,obr.playerId]);
  useEffect(()=>{
    const w=new Worker(new URL('./probability.worker.ts',import.meta.url),{type:'module'}); worker.current=w;
    w.onmessage=(event:MessageEvent<{id:number;dialect?:Dialect;result?:Distribution;notation?:{short:string;longReadable:string;longExpanded:string};error?:string;incomplete?:boolean}>)=>{ if(event.data.id!==sequence.current)return; setChart(event.data.result??null); setDetectedDialect(event.data.dialect); setNotation(event.data.notation??null); setChartError(event.data.incomplete?'':event.data.error??''); };
    return ()=>{w.terminate();worker.current=null;};
  },[]);
  useEffect(()=>{
    const w=new Worker(new URL('./fairness.worker.ts',import.meta.url),{type:'module'}); fairnessWorker.current=w;
    w.onmessage=(event:MessageEvent<{id:number;type:'snapshot'|'error';snapshot?:FairnessSnapshot;running?:boolean;error?:string}>)=>{
      if(event.data.id!==fairnessId.current)return;
      if(event.data.type==='snapshot') { setFairness(event.data.snapshot??null); setFairnessRunning(Boolean(event.data.running)); }
      else { setFairnessError(event.data.error??'Sampling failed'); setFairnessRunning(false); }
    };
    return ()=>{w.terminate();fairnessWorker.current=null;};
  },[]);
  useEffect(()=>{
    const id=++sequence.current; setChart(null); setDetectedDialect(undefined); setNotation(null); setChartError('');
    setChartRolls([]);setSelected(null);
    const previous=fairnessId.current++; fairnessWorker.current?.postMessage({type:'stop',id:previous});
    setFairness(null); setFairnessRunning(false); setFairnessError('');
    if(!expression.trim())return;
    const t=window.setTimeout(()=>worker.current?.postMessage({id,expression,dialect:dialectHint}),150);
    return ()=>window.clearTimeout(t);
  },[expression,dialectHint]);
  useEffect(()=>{
    if(obr.status!=='ready'||!obr.playerId)return;
    const requestOff=OBR.broadcast.onMessage(REQUEST_CHANNEL,event=>{ if(obr.role==='GM'&&isRequest(event.data)&&event.data.expression.length<=1000&&event.data.visibility!=='gm') void perform(event.data,false); });
    return ()=>{requestOff();};
  // Register once for this player. Other state is read from the current closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[obr.status,obr.playerId,obr.playerName,obr.role]);
  async function perform(req:RollRequest,local:boolean) {
    setBusy(true);
    try {
      const v=req.visibility??'everyone';
      const {record:result}=rollExpression({
        requestId:req.requestId,expression:req.expression,dialect:req.dialect,visibility:v,
        playerId:obr.playerId??'',playerName:obr.playerName??'Player',label:req.label,source:req.source,
      });
      const d=result.dialect;
      if(local&&req.expression===currentInput.current.expression)currentInput.current.dialect=d;
      if(v==='everyone') await OBR.broadcast.sendMessage(RESULT_CHANNEL,result);
      if(v==='gm'&&obr.role!=='GM') await OBR.broadcast.sendMessage(GM_CHANNEL,await encryptForGm(result));
      if(local)pendingLocalRolls.current.add(result.requestId);
      if(obr.roomId&&obr.playerId)revealChannel.current?.postMessage({type:'result',roomId:obr.roomId,playerId:obr.playerId,result} satisfies LocalMessage);
      if(local)setInputError('');
    } catch(error) {
      pendingLocalRolls.current.delete(req.requestId);
      const message=error instanceof Error?error.message:'Roll failed';
      if(local)setInputError(message);
      else if((req.visibility??'everyone')==='everyone') {
        const failed:RollResult={version:1,requestId:req.requestId,expression:req.expression,dialect:req.dialect??'nodice',visibility:'everyone',playerId:obr.playerId??'',playerName:obr.playerName??'Player',value:'',trace:[],time:Date.now(),error:message,source:req.source,label:req.label};
        await OBR.broadcast.sendMessage(RESULT_CHANNEL,failed).catch(()=>{});
      }
    }
    finally {setBusy(false);}
  }
  function submit() { void perform({version:1,requestId:crypto.randomUUID(),expression,dialect:dialectHint,visibility},true); }
  function useShortcut(term:string,requestId:string) {
    const next=applyDiceShortcutOnce(currentInput.current.expression,term,requestId,seenShortcutIds.current);
    if(next===null)return;
    currentInput.current.expression=next;
    setExpression(next);setDialectHint(undefined);setSelected(null);setInputError('');
    requestAnimationFrame(()=>{inputRef.current?.focus();inputRef.current?.setSelectionRange(next.length,next.length);});
  }
  function toggleFairness() {
    if(fairnessRunning){fairnessWorker.current?.postMessage({type:'stop',id:fairnessId.current});setFairnessRunning(false);return;}
    const id=++fairnessId.current;
    setFairness(null);setFairnessError('');setFairnessRunning(true);
    fairnessWorker.current?.postMessage({type:'start',id,expression,dialect:dialectHint});
  }
  useEffect(()=>{
    if(!collapsed.history||!historyPreviewRef.current)return;
    const preview=historyPreviewRef.current;
    const measure=()=>{
      let count=0;
      for(const child of Array.from(preview.children) as HTMLElement[]){
        if(child.offsetLeft+child.offsetWidth>preview.clientWidth)break;
        count++;
      }
      setHistoryPreviewCount(count);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(preview);
    requestAnimationFrame(measure);
    return ()=>observer.disconnect();
  },[collapsed.history,history]);
  if(obr.status==='connecting')return <StatusPanel title="Connecting to Owlbear Rodeo" message="Waiting for room access…"/>;
  if(obr.status==='error')return <StatusPanel title="No Dice unavailable" message={obr.error??'Could not connect to Owlbear Rodeo'} onRetry={()=>void obr.refresh()}/>;
  const max=Math.max(0,...(chart?.entries.map(x=>x.probability)??[]));
  const fairCounts=new Map(fairness?.counts.map(item=>[JSON.stringify(item.value),item.count])??[]);
  const historicCounts=new Map<string,number>();
  for(const value of chartRolls){const key=JSON.stringify(value);historicCounts.set(key,(historicCounts.get(key)??0)+1);}
  const shownFair=chart?.entries.slice(0,MAX_VISIBLE_BARS).reduce((sum,item)=>sum+(fairCounts.get(JSON.stringify(item.value))??0),0)??0;
  const recent=history.at(-1);
  const older=history.slice(0,-1).reverse();
  const sendPanel=(message:PanelCommand)=>{
    if(obr.roomId&&obr.playerId)panelChannel.current?.postMessage({...message,roomId:obr.roomId,playerId:obr.playerId});
  };
  const toggle=(section:'distribution'|'recent'|'history')=>setCollapsed(previous=>({...previous,[section]:!previous[section]}));
  const entry=(item:RollResult)=><article className="entry" key={item.requestId}>
    <div className="entry-meta"><strong>{item.playerName}</strong><span>{item.visibility==='everyone'?'Everyone':item.visibility==='gm'?'GM':'Self'} · {new Date(item.time).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span></div>
    <button type="button" className="expression-link" onClick={()=>{setExpression(item.expression);setDialectHint(item.dialect);setSelected(null);}} title="Put this expression back in the input">{item.expression}</button>
    {item.label&&<div className="entry-label">{item.label}</div>}
    <div className="result">{item.error?'ERROR':'RESULT'} <strong>{item.error??display(item.value)}</strong>{item.interpretation&&<span className="interpretation">{item.interpretation}</span>}</div>
    <details><summary>Show work</summary><ol>{(item.steps?.length?item.steps:item.trace).map((step,i)=><li key={i}>{step}</li>)}</ol></details>
  </article>;
  return <main className="no-dice" ref={panelRef}>
    <header className="panel-title" onPointerDown={event=>{if((event.target as HTMLElement).closest('button'))return;dragStart.current={x:event.screenX,y:event.screenY};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerUp={event=>{const start=dragStart.current;dragStart.current=null;if(start){const dx=event.screenX-start.x,dy=event.screenY-start.y;if(Math.abs(dx)+Math.abs(dy)>5)sendPanel({type:'move',dx,dy});}}} onPointerCancel={()=>{dragStart.current=null;}}>
      <div className="header-brand"><img className="header-icon" src="./icon.svg" alt="" aria-hidden="true"/><h1>No Dice</h1><span className="version">v{RELEASE_VERSION}</span></div>{obr.role==='GM'&&<button type="button" className="settings-toggle" aria-label="GM settings" aria-expanded={settingsOpen} title="GM settings" onClick={()=>setSettingsOpen(value=>!value)}>⚙</button>}
    </header>
    {obr.role==='GM'&&settingsOpen&&<GMSettings settings={roomSettings} onSaved={()=>setSettingsOpen(false)}/>}
    <section className="probability" aria-label="Probability distribution">
      <button type="button" className="section-heading section-toggle" aria-expanded={!collapsed.distribution} onClick={()=>toggle('distribution')}><span className="section-label"><span className="chevron" aria-hidden="true">{collapsed.distribution?'▸':'▾'}</span><strong>Distribution</strong></span><span>{chart?(chart.exact?'Exact':'≈ Estimated'):chartError?'Unavailable':'Enter an expression'}</span></button>
      {!collapsed.distribution&&<>
        <div className={`bars${chart ? '' : ' distribution-placeholder'}`} role={chart ? 'img' : undefined} aria-label={chart ? 'Probability mass chart with roll history and fairness overlay' : undefined} aria-hidden={chart ? undefined : true}>{chart?.entries.slice(0,MAX_VISIBLE_BARS).map((item,i)=>{const key=JSON.stringify(item.value),observed=fairCounts.get(key)??0,historic=historicCounts.get(key)??0,rate=fairness?.total?observed/fairness.total:0;return <div className={'bar-cell '+(selected?.expression===expression&&selected.dialect===detectedDialect&&display(selected.value)===display(item.value)?'actual':'')} key={i} title={display(item.value)+': expected '+(item.probability*100).toFixed(3)+'%; ledger rolls '+historic}><div className="bar-pair"><div className="bar" style={{height:Math.max(3,item.probability/max*100)+'%'}}/>{fairness&&<div className="bar observed" style={{height:observed?Math.max(3,rate/max*100)+'%':'0'}}/>}</div>{historic>0&&<span className="history-mark">{historic}</span>}<small>{display(item.value)}</small></div>;})}</div>
        <div className={`stats${chart ? '' : ' distribution-placeholder-stats'}`} aria-hidden={chart ? undefined : true}>{chart?<><span>{chart.range?'Range '+chart.range[0]+'–'+chart.range[1]:chart.entries.length+' outcomes'}</span>{chart.mean!==undefined&&<span>Mean {chart.mean.toFixed(2)}</span>}{chart.standardDeviation!==undefined&&<span>SD {chart.standardDeviation.toFixed(2)}</span>}<span>Mode {display(chart.mode??'—')}</span>{chartRolls.length>0&&<span>{chartRolls.length} ledger rolls</span>}</>:<><span>Range —</span><span>Mean —</span><span>SD —</span><span>Mode —</span></>}</div>
        <div className="fairness-controls">{notation&&<details className="notation"><summary>Notation</summary><dl><dt>Original</dt><dd>{expression}</dd><dt>Short</dt><dd>{notation.short}</dd><dt>Readable long</dt><dd>{notation.longReadable}</dd><dt>Expanded</dt><dd>{notation.longExpanded}</dd></dl></details>}<button type="button" onClick={toggleFairness} disabled={!expression.trim()} aria-pressed={fairnessRunning}>{fairnessRunning?'Stop':'Calculate fairness'}</button>{fairness&&<span className="fairness-legend"><i aria-hidden="true"/> Observed · {fairness.total.toLocaleString()} rolls{fairness.total>shownFair?' · '+(fairness.total-shownFair).toLocaleString()+' outside visible chart':''}</span>}</div>
        {fairnessError&&<div className="input-error" role="alert">{fairnessError}</div>}
      </>}
    </section>
    <form className="composer" onSubmit={e=>{e.preventDefault();submit();}}>
      <label htmlFor="expression">Expression</label>
      <div className="expression-row"><input id="expression" ref={inputRef} autoComplete="off" spellCheck={false} value={expression} onChange={e=>{currentInput.current.expression=e.target.value;setExpression(e.target.value);setDialectHint(undefined);setSelected(null);setInputError('');}} placeholder="Enter expression" aria-describedby={inputError||chartError?'input-error':undefined}/><button type="button" className="clear-expression" disabled={!expression} onClick={()=>{currentInput.current.expression='';setExpression('');setDialectHint(undefined);setSelected(null);setInputError('');inputRef.current?.focus();}} aria-label="Clear expression">Clear</button><select aria-label="Roll audience" value={visibility} onChange={e=>setVisibility(e.target.value as Visibility)}><option value="everyone">All</option><option value="self">Self</option><option value="gm">GM</option></select><button type="submit" className="roll-button" disabled={busy||!expression.trim()}>Roll</button></div>
      {inputError&&<div id="input-error" className="input-error" role="alert">{inputError}</div>}
      {!inputError&&chartError&&<div id="input-error" className="input-error" role="status">{chartError}</div>}
    </form>
    <section className="recent-section" aria-label="Most recent result">
      <button type="button" className="section-heading section-toggle" aria-expanded={!collapsed.recent} onClick={()=>toggle('recent')}><span className="section-label"><span className="chevron" aria-hidden="true">{collapsed.recent?'▸':'▾'}</span><strong>Most Recent Result</strong></span>{collapsed.recent&&recent&&<span className="collapsed-output">{recent.error??display(recent.value)}</span>}</button>
      {!collapsed.recent&&(recent?entry(recent):<div className="empty">No rolls yet.</div>)}
    </section>
    <section className="ledger" aria-label="Roll history">
      <button type="button" className="section-heading section-toggle" aria-expanded={!collapsed.history} onClick={()=>toggle('history')}><span className="section-label"><span className="chevron" aria-hidden="true">{collapsed.history?'▸':'▾'}</span><strong>History</strong></span>{collapsed.history&&<span className="collapsed-history" ref={historyPreviewRef}>{older.map((item,index)=><span className="collapsed-history-result" key={item.requestId} style={{visibility:index<historyPreviewCount?'visible':'hidden'}} aria-hidden={index>=historyPreviewCount}>{item.error??display(item.value)}</span>)}</span>}</button>
      {!collapsed.history&&(older.length?older.map(entry):<div className="empty">No earlier rolls.</div>)}
    </section>
  </main>;
}
