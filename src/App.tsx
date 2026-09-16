import OBR from '@owlbear-rodeo/sdk';
import { useEffect, useRef, useState } from 'react';
import { StatusPanel } from './components/StatusPanel';
import { parse } from './engine/parser';
import { roll, type Value } from './engine/evaluate';
import type { Dialect } from './engine/ast';
import type { Distribution } from './engine/probability';
import { useOwlbear } from './hooks/useOwlbear';
import { loadHistory, saveHistory } from './persistence';
import { decryptForGm, encryptForGm, publishGmKey } from './gmCrypto';
import { GM_CHANNEL, isRequest, isResult, REQUEST_CHANNEL, RESULT_CHANNEL, type EncryptedResult, type RollRequest, type RollResult, type Visibility } from './protocol';

const display=(v:Value)=>Array.isArray(v)?`[${v.join(', ')}]`:String(v);
export default function App() {
  const obr=useOwlbear();
  const [expression,setExpression]=useState('2d6');
  const [dialect,setDialect]=useState<Dialect>('nodice');
  const [visibility,setVisibility]=useState<Visibility>('everyone');
  const [history,setHistory]=useState<RollResult[]>([]);
  const [chart,setChart]=useState<Distribution|null>(null);
  const [chartError,setChartError]=useState('');
  const [inputError,setInputError]=useState('');
  const [selected,setSelected]=useState<RollResult|null>(null);
  const [busy,setBusy]=useState(false);
  const worker=useRef<Worker|null>(null);
  const gmKey=useRef<CryptoKey|null>(null);
  const sequence=useRef(0);
  const historyRef=useRef<RollResult[]>([]);
  const add=(result:RollResult)=>{ if(historyRef.current.some(x=>x.requestId===result.requestId)) return; const next=[...historyRef.current,result].slice(-100); historyRef.current=next; setHistory(next); };
  useEffect(()=>{ if(!obr.roomId||!obr.playerId)return; const stored=loadHistory(obr.roomId,obr.playerId); historyRef.current=stored; setHistory(stored); },[obr.roomId,obr.playerId]);
  useEffect(()=>{ if(obr.roomId&&obr.playerId)saveHistory(obr.roomId,obr.playerId,history); },[history,obr.roomId,obr.playerId]);
  useEffect(()=>{
    const w=new Worker(new URL('./probability.worker.ts',import.meta.url),{type:'module'}); worker.current=w;
    w.onmessage=(event:MessageEvent<{id:number;result?:Distribution;error?:string;incomplete?:boolean}>)=>{ if(event.data.id!==sequence.current)return; setChart(event.data.result??null); setChartError(event.data.incomplete?'':event.data.error??''); };
    return ()=>{w.terminate();worker.current=null;};
  },[]);
  useEffect(()=>{
    const id=++sequence.current; setChart(null); setChartError('');
    if(!expression.trim())return;
    const t=window.setTimeout(()=>worker.current?.postMessage({id,expression,dialect}),150);
    return ()=>window.clearTimeout(t);
  },[expression,dialect]);
  useEffect(()=>{
    if(obr.status!=='ready'||!obr.playerId)return;
    if(obr.role==='GM') void publishGmKey().then(key=>{gmKey.current=key;}).catch(()=>setInputError('Could not initialize GM privacy.'));
    const resultOff=OBR.broadcast.onMessage(RESULT_CHANNEL,event=>{ if(isResult(event.data)&&event.data.visibility==='everyone') add(event.data); });
    const gmOff=OBR.broadcast.onMessage(GM_CHANNEL,event=>{ if(obr.role!=='GM'||!gmKey.current)return; const payload=event.data as EncryptedResult; if(payload?.version!==1||typeof payload.ciphertext!=='string')return; void decryptForGm(payload,gmKey.current).then(result=>{if(isResult(result))add(result);}).catch(()=>{}); });
    const requestOff=OBR.broadcast.onMessage(REQUEST_CHANNEL,event=>{ if(obr.role==='GM'&&isRequest(event.data)&&event.data.expression.length<=1000&&event.data.visibility!=='gm') void perform(event.data,false); });
    return ()=>{resultOff();gmOff();requestOff();gmKey.current=null;};
  // Register once for this player. Other state is read from the current closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[obr.status,obr.playerId,obr.playerName,obr.role]);
  async function perform(req:RollRequest,local:boolean) {
    setBusy(true);
    try {
      const d=req.dialect??'nodice', v=req.visibility??'everyone';
      const outcome=roll(parse(req.expression,d));
      const result:RollResult={version:1,requestId:req.requestId,expression:req.expression,dialect:d,visibility:v,playerId:obr.playerId??'',playerName:obr.playerName??'Player',value:outcome.value,trace:outcome.trace,time:Date.now(),label:req.label,source:req.source};
      if(v==='everyone') await OBR.broadcast.sendMessage(RESULT_CHANNEL,result);
      if(v==='gm'&&obr.role!=='GM') await OBR.broadcast.sendMessage(GM_CHANNEL,await encryptForGm(result));
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
  function submit() { void perform({version:1,requestId:crypto.randomUUID(),expression,dialect,visibility},true); }
  if(obr.status==='connecting')return <StatusPanel title="Connecting to Owlbear Rodeo" message="Waiting for room access…"/>;
  if(obr.status==='error')return <StatusPanel title="No Dice unavailable" message={obr.error??'Could not connect to Owlbear Rodeo'} onRetry={()=>void obr.refresh()}/>;
  const max=Math.max(0,...(chart?.entries.map(x=>x.probability)??[]));
  return <main className="no-dice">
    <header><div><div className="eyebrow">NO DICE <span>· PROBABILITY & RECEIPTS</span></div><h1>Roll ledger</h1></div><div className="identity">{obr.playerName??'Player'}<small>{obr.role??''}</small></div></header>
    <section className="probability" aria-label="Probability distribution">
      <div className="section-heading"><strong>Distribution</strong><span>{chart?(chart.exact?'Exact distribution':`≈ Estimated from ${chart.trials?.toLocaleString()} trials`):chartError?'Unavailable':'Enter an expression'}</span></div>
      {chart&&<><div className="bars" role="img" aria-label="Probability mass chart">{chart.entries.slice(0,80).map((entry,i)=><div className={`bar-cell ${selected?.expression===expression&&display(selected.value)===display(entry.value)?'actual':''}`} key={i} title={`${display(entry.value)}: ${(entry.probability*100).toFixed(3)}%`}><div className="bar" style={{height:`${Math.max(3,entry.probability/max*100)}%`}}/><small>{display(entry.value)}</small></div>)}</div><div className="stats"><span>{chart.range?`Range ${chart.range[0]}–${chart.range[1]}`:`${chart.entries.length} outcomes`}</span>{chart.mean!==undefined&&<span>Mean {chart.mean.toFixed(2)}</span>}<span>Mode {display(chart.mode??'—')}</span></div></>}
      {chartError&&<p className="chart-error">{chartError}</p>}
    </section>
    <section className="ledger" aria-label="Roll history">{history.length===0?<div className="empty">No rolls yet. Enter an expression to see its probabilities, then roll.</div>:history.slice().reverse().map(item=><article className="entry" key={item.requestId}><div className="entry-meta"><strong>{item.playerName}</strong><span>{item.visibility==='everyone'?'Everyone':item.visibility==='gm'?'GM':'Self'} · {new Date(item.time).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span></div><button className="expression-link" onClick={()=>{setExpression(item.expression);setDialect(item.dialect);setSelected(item);}} title="Put this expression back in the input">{item.expression}</button><div className="result">{item.error?'ERROR':'TOTAL'} <strong>{item.error??display(item.value)}</strong></div><details><summary>Evaluation trace</summary><ol>{item.trace.map((step,i)=><li key={i}>{step}</li>)}</ol></details></article>)}</section>
    <form className="composer" onSubmit={e=>{e.preventDefault();submit();}}><label htmlFor="expression">Expression</label><input id="expression" autoComplete="off" spellCheck={false} value={expression} onChange={e=>{setExpression(e.target.value);setSelected(null);setInputError('');}} placeholder="2d6+4 · H3[4d6] · d{Miss,Hit,Crit}" aria-describedby={inputError?'input-error':undefined}/>{inputError&&<div id="input-error" className="input-error" role="alert">{inputError}</div>}<div className="controls"><select aria-label="Expression dialect" value={dialect} onChange={e=>setDialect(e.target.value as Dialect)}><option value="nodice">No Dice</option><option value="roll20">Roll20</option></select><select aria-label="Roll visibility" value={visibility} onChange={e=>setVisibility(e.target.value as Visibility)}><option value="everyone">Everyone</option><option value="self">Self</option><option value="gm">GM</option></select><button type="submit" disabled={busy||!expression.trim()}>Roll ↵</button></div></form>
  </main>;
}
