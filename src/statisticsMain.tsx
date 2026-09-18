import OBR from '@owlbear-rodeo/sdk';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { applyOwlbearTheme } from './theme';
import { getSessionRolls, LEDGER_CHANNEL, listSessions, migrateHistory, readSharedSession, type DiceSession, type StoredRoll } from './sessionLedger';
import { analyzeSession, queryOutcomes, type Comparison, type OutcomeMode } from './sessionStats';
import { SequenceTab } from './SequenceTab';
import { EXTENSION_ID } from './constants';
import './styles.css';
import './statistics.css';

const percentage=(count:number,total:number)=>total?`${(count/total*100).toFixed(1)}%`:'0.0%';

function Statistics(){
  const [identity,setIdentity]=useState<{room:string;player:string}|null>(null);
  const [sessions,setSessions]=useState<DiceSession[]>([]);
  const [selected,setSelected]=useState('');
  const [rolls,setRolls]=useState<StoredRoll[]>([]);
  const [tab,setTab]=useState<'overview'|'sequence'>('overview');
  const [player,setPlayer]=useState('');
  const [expression,setExpression]=useState('');
  const [mode,setMode]=useState<OutcomeMode>('results');
  const [operator,setOperator]=useState<Comparison>('<=');
  const [threshold,setThreshold]=useState('6');
  useEffect(()=>{
    let active=true,offTheme:(()=>void)|undefined,offMetadata:(()=>void)|undefined;
    OBR.onReady(async()=>{
      if(!active)return;
      const room=OBR.room.id,player=OBR.player.id;
      setIdentity({room,player});
      try{applyOwlbearTheme(await OBR.theme.getTheme());offTheme=OBR.theme.onChange(applyOwlbearTheme);}catch{/* CSS fallback */}
      const refresh=async()=>{const shared=readSharedSession(await OBR.room.getMetadata());await migrateHistory(room,player,shared);const all=await listSessions(room,player);if(active){setSessions(all);setSelected(value=>value||all.find(s=>!s.endedAt)?.id||all[0]?.id||'');}};
      await refresh().catch(()=>{});
      offMetadata=OBR.room.onMetadataChange(()=>{void refresh().catch(()=>{});});
    });
    return()=>{active=false;offTheme?.();offMetadata?.();};
  },[]);
  useEffect(()=>{if(!identity||!selected)return;let active=true;void getSessionRolls(identity.room,identity.player,selected).then(value=>{if(active)setRolls(value);});return()=>{active=false;};},[identity,selected]);
  useEffect(()=>{if(!identity||!selected)return;const channel=new BroadcastChannel(LEDGER_CHANNEL);channel.onmessage=event=>{if(event.data?.roomId===identity.room&&event.data?.playerId===identity.player)void getSessionRolls(identity.room,identity.player,selected).then(setRolls);};return()=>channel.close();},[identity,selected]);
  const stats=useMemo(()=>analyzeSession(rolls,player||undefined,expression||undefined,mode),[rolls,player,expression,mode]);
  const selectedSession=sessions.find(item=>item.id===selected);
  const numeric=threshold.trim()!==''&&Number.isFinite(Number(threshold))?Number(threshold):null;
  const matches=numeric===null?0:queryOutcomes(stats.distribution,operator,numeric);
  return <main className="statistics-window">
    <header><div><h1>Session Statistics</h1><p>Based on rolls visible to you.</p></div><button type="button" aria-label="Close statistics" onClick={()=>void OBR.popover.close(`${EXTENSION_ID}/statistics`)}>×</button></header>
    <div className="statistics-content">
      <label className="session-select">Session <select value={selected} onChange={event=>{setSelected(event.target.value);setPlayer('');setExpression('');}}>{sessions.map(item=><option key={item.id} value={item.id}>{item.endedAt?item.name:`Current Session · ${item.name}`}</option>)}</select></label>
      <h2>{selectedSession?.name??'Current Session'}</h2>
      <nav className="statistics-tabs" aria-label="Statistics view"><button type="button" aria-current={tab==='overview'?'page':undefined} onClick={()=>setTab('overview')}>Overview</button><button type="button" aria-current={tab==='sequence'?'page':undefined} onClick={()=>setTab('sequence')}>Roll Sequence</button></nav>
      {tab==='sequence'?<SequenceTab key={selected} rolls={rolls}/>:<>
        <div className="headline-stats"><div><strong>{stats.totalRolls}</strong><span>rolls</span></div><div><strong>{stats.totalDice}</strong><span>dice</span></div><div><strong>{stats.distinctRollers}</strong><span>rollers</span></div><div><strong>{stats.distinctExpressions}</strong><span>expressions</span></div></div>
        <section><h3>Players</h3><table><thead><tr><th>Player</th><th>Rolls</th><th>Dice</th><th>% of session rolls</th></tr></thead><tbody>{stats.players.map(item=><tr key={item.key} className={player===item.key?'selected':''} tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setPlayer(player===item.key?'':item.key);}}} onClick={()=>setPlayer(player===item.key?'':item.key)}><td>{item.label}</td><td>{item.rolls}</td><td>{item.dice}</td><td>{percentage(item.rolls,stats.totalRolls)}</td></tr>)}</tbody></table>{player&&<button type="button" onClick={()=>setPlayer('')}>Clear player filter</button>}</section>
        <section><h3>Expressions</h3><table><thead><tr><th>Expression</th><th>Rolls</th><th>Rollers</th></tr></thead><tbody>{stats.expressions.map(item=><tr key={item.key} className={expression===item.key?'selected':''} tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setExpression(expression===item.key?'':item.key);}}} onClick={()=>setExpression(expression===item.key?'':item.key)}><td><code>{item.label}</code></td><td>{item.rolls}</td><td>{item.rollers}</td></tr>)}</tbody></table>{expression&&<button type="button" onClick={()=>setExpression('')}>Clear expression filter</button>}</section>
        <section><h3>Outcomes</h3><div className="mode-tabs"><button type="button" aria-pressed={mode==='results'} onClick={()=>setMode('results')}>Results</button><button type="button" aria-pressed={mode==='dice'} onClick={()=>setMode('dice')}>Dice</button></div><p className="filter-summary">{stats.filteredRolls} roll events selected{player||expression?' by filters':''}.</p><div className="query"><label>Count outcomes <select value={operator} onChange={event=>setOperator(event.target.value as Comparison)}><option>=</option><option>&lt;=</option><option>&gt;=</option></select></label><input type="number" aria-label="Outcome value" value={threshold} onChange={event=>setThreshold(event.target.value)}/><strong>{numeric===null?'Enter a number':`${matches} of ${stats.outcomeCount} ${mode==='results'?'results':'dice'} (${percentage(matches,stats.outcomeCount)})`}</strong></div><table><thead><tr><th>Outcome</th><th>Count</th><th>Observed %</th></tr></thead><tbody>{stats.distribution.map(item=><tr key={`${typeof item.value}:${item.value}`}><td>{item.value}</td><td>{item.count}</td><td>{percentage(item.count,stats.outcomeCount)}</td></tr>)}</tbody></table></section>
      </>}
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Statistics/></StrictMode>);
