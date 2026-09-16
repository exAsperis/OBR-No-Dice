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

const display=displayValue;
export default function App() {
  const obr=useOwlbear();
  const [expression,setExpression]=useState('2d6');
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
  const worker=useRef<Worker|null>(null);
  const fairnessWorker=useRef<Worker|null>(null);
  const fairnessId=useRef(0);
  const revealChannel=useRef<BroadcastChannel|null>(null);
  const sequence=useRef(0);
  const historyRef=useRef<RollResult[]>([]);
  const currentInput=useRef({expression,dialect:detectedDialect});
  currentInput.current={expression,dialect:detectedDialect};
  const add=(result:RollResult)=>{ if(historyRef.current.some(x=>x.requestId===result.requestId)) return; const next=[...historyRef.current,result].slice(-100); historyRef.current=next; setHistory(next); if(!result.error&&result.expression===currentInput.current.expression&&result.dialect===currentInput.current.dialect)setChartRolls(previous=>[...previous,result.value]); };
  useEffect(()=>{ if(!obr.roomId||!obr.playerId)return; const stored=loadHistory(obr.roomId,obr.playerId); historyRef.current=stored; setHistory(stored); },[obr.roomId,obr.playerId]);
  useEffect(()=>{ if(obr.roomId&&obr.playerId)saveHistory(obr.roomId,obr.playerId,history); },[history,obr.roomId,obr.playerId]);
  useEffect(()=>{
    if(!obr.roomId||!obr.playerId)return;
    const channel=new BroadcastChannel(LOCAL_CHANNEL);revealChannel.current=channel;
    channel.onmessage=(event:MessageEvent<unknown>)=>{
      if(!isLocalMessage(event.data)||event.data.type!=='show'||!isResult(event.data.result))return;
      if(event.data.roomId===obr.roomId&&event.data.playerId===obr.playerId)add(event.data.result);
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
    const resultOff=OBR.broadcast.onMessage(RESULT_CHANNEL,event=>{ if(isResult(event.data)&&event.data.visibility==='everyone') add(event.data); });
    const requestOff=OBR.broadcast.onMessage(REQUEST_CHANNEL,event=>{ if(obr.role==='GM'&&isRequest(event.data)&&event.data.expression.length<=1000&&event.data.visibility!=='gm') void perform(event.data,false); });
    return ()=>{resultOff();requestOff();};
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
      if(obr.roomId&&obr.playerId)revealChannel.current?.postMessage({type:'result',roomId:obr.roomId,playerId:obr.playerId,result} satisfies LocalMessage);
      add(result); if(local){setSelected(result);setInputError('');}
    } catch(error) {
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
  function toggleFairness() {
    if(fairnessRunning){fairnessWorker.current?.postMessage({type:'stop',id:fairnessId.current});setFairnessRunning(false);return;}
    const id=++fairnessId.current;
    setFairness(null);setFairnessError('');setFairnessRunning(true);
    fairnessWorker.current?.postMessage({type:'start',id,expression,dialect:dialectHint});
  }
  if(obr.status==='connecting')return <StatusPanel title="Connecting to Owlbear Rodeo" message="Waiting for room access…"/>;
  if(obr.status==='error')return <StatusPanel title="No Dice unavailable" message={obr.error??'Could not connect to Owlbear Rodeo'} onRetry={()=>void obr.refresh()}/>;
  const max=Math.max(0,...(chart?.entries.map(x=>x.probability)??[]));
  const fairCounts=new Map(fairness?.counts.map(item=>[JSON.stringify(item.value),item.count])??[]);
  const historicCounts=new Map<string,number>();
  for(const value of chartRolls){const key=JSON.stringify(value);historicCounts.set(key,(historicCounts.get(key)??0)+1);}
  const shownFair=chart?.entries.slice(0,80).reduce((sum,item)=>sum+(fairCounts.get(JSON.stringify(item.value))??0),0)??0;
  return <main className="no-dice">
    <header><div className="header-brand"><img className="header-icon" src="./icon.svg" alt="" aria-hidden="true"/><div><div className="eyebrow">NO DICE <span>· PROBABILITY & RECEIPTS</span></div><h1>Roll ledger</h1></div></div><div className="identity">{obr.playerName??'Player'}<small>{obr.role??''}</small></div></header>
    <section className="probability" aria-label="Probability distribution">
      <div className="section-heading"><strong>Distribution</strong><span>{chart?(chart.exact?'Exact distribution':`≈ Estimated from ${chart.trials?.toLocaleString()} trials`):chartError?'Unavailable':'Enter an expression'}</span></div>
      {chart&&<><div className="bars" role="img" aria-label="Probability mass chart with roll history and fairness overlay">{chart.entries.slice(0,80).map((entry,i)=>{const valueKey=JSON.stringify(entry.value),observed=fairCounts.get(valueKey)??0,historic=historicCounts.get(valueKey)??0;const observedRate=fairness?.total?observed/fairness.total:0;return <div className={`bar-cell ${selected?.expression===expression&&selected.dialect===detectedDialect&&display(selected.value)===display(entry.value)?'actual':''}`} key={i} title={`${display(entry.value)}: expected ${(entry.probability*100).toFixed(3)}%; ledger rolls ${historic}; fairness ${fairness?.total?(observedRate*100).toFixed(3)+'% ('+observed+')':'—'}`}><div className="bar-pair"><div className="bar" style={{height:`${Math.max(3,entry.probability/max*100)}%`}}/>{fairness&&<div className="bar observed" style={{height:observed?`${Math.max(3,observedRate/max*100)}%`:'0'}}/>}</div>{historic>0&&<span className="history-mark" aria-label={`${historic} ledger rolls: ${display(entry.value)}`}>{historic}</span>}<small>{display(entry.value)}</small></div>;})}</div><div className="stats"><span>{chart.range?`Range ${chart.range[0]}–${chart.range[1]}`:`${chart.entries.length} outcomes`}</span>{chart.mean!==undefined&&<span>Mean {chart.mean.toFixed(2)}</span>}<span>Mode {display(chart.mode??'—')}</span>{chartRolls.length>0&&<span>{chartRolls.length} ledger rolls</span>}</div><div className="fairness-controls"><button type="button" onClick={toggleFairness} disabled={!expression.trim()} aria-pressed={fairnessRunning}>{fairnessRunning?'Stop':'Calculate fairness'}</button>{fairness&&<span className="fairness-legend"><i aria-hidden="true"/> Observed · {fairness.total.toLocaleString()} rolls{fairness.total>shownFair?' · '+(fairness.total-shownFair).toLocaleString()+' outside visible chart':''}</span>}</div>{fairnessError&&<div className="input-error" role="alert">{fairnessError}</div>}</>}
    </section>
    <section className="ledger" aria-label="Roll history">{history.length===0?<div className="empty">No rolls yet. Enter an expression to see its probabilities, then roll.</div>:history.slice().reverse().map(item=><article className="entry" key={item.requestId}><div className="entry-meta"><strong>{item.playerName}</strong><span>{item.visibility==='everyone'?'Everyone':item.visibility==='gm'?'GM':'Self'} · {new Date(item.time).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span></div><button className="expression-link" onClick={()=>{setExpression(item.expression);setDialectHint(item.dialect);setSelected(null);}} title="Put this expression back in the input">{item.expression}</button>{item.label&&<div className="entry-label">{item.label}</div>}<div className="result">{item.error?'ERROR':'RESULT'} <strong>{item.error??display(item.value)}</strong>{item.interpretation&&<span className="interpretation">{item.interpretation}</span>}</div><details><summary>Show work</summary><ol>{(item.steps?.length?item.steps:item.trace).map((step,i)=><li key={i}>{step}</li>)}</ol></details></article>)}</section>
    <form className="composer" onSubmit={e=>{e.preventDefault();submit();}}>
      <label htmlFor="expression">Expression</label>
      <input id="expression" autoComplete="off" spellCheck={false} value={expression} onChange={e=>{setExpression(e.target.value);setDialectHint(undefined);setSelected(null);setInputError('');}} placeholder="2d6+4 · H3[4d6] · d{Miss,Hit,Crit}" aria-describedby={inputError||chartError?'input-error':undefined}/>
      {inputError&&<div id="input-error" className="input-error" role="alert">{inputError}</div>}
      {!inputError&&chartError&&<div id="input-error" className="input-error" role="status">{chartError}</div>}
      {notation&&<details className="notation"><summary>Notation</summary><dl><dt>Original</dt><dd>{expression}</dd><dt>Short</dt><dd>{notation.short}</dd><dt>Readable long</dt><dd>{notation.longReadable}</dd><dt>Expanded</dt><dd>{notation.longExpanded}</dd></dl></details>}
      <div className="controls"><select aria-label="Roll visibility" value={visibility} onChange={e=>setVisibility(e.target.value as Visibility)}><option value="everyone">Everyone</option><option value="self">Self</option><option value="gm">GM</option></select><button type="submit" disabled={busy||!expression.trim()}>Roll ↵</button></div>
    </form>
  </main>;
}
