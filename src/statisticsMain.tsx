import OBR from '@owlbear-rodeo/sdk';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { applyOwlbearTheme } from './theme';
import { getSessionRolls, LEDGER_CHANNEL, listSessions, migrateHistory, readSharedSession, synchronizeRoomSession, type DiceSession, type StoredRoll } from './sessionLedger';
import { readRoomSettings } from './roomSettings';
import { filterRolls, expressionStats, playerStats } from './analytics';
import { AnalyticsTabs, tabs, type AnalyticsTab } from './AnalyticsTabs';
import { EXTENSION_ID } from './constants';
import { PANEL_CHANNEL, type PanelMessage } from './panelProtocol';
import './styles.css';
import './statistics.css';

const percentage=(count:number,total:number)=>total?`${(count/total*100).toFixed(1)}%`:'0.0%';
const viewTransitionKey=`${EXTENSION_ID}/statistics-view-transition`;
type StatisticsView={selected:string;tab:AnalyticsTab|'query';player:string;expression:string};
const restoredView=(()=>{try{const value=sessionStorage.getItem(viewTransitionKey);sessionStorage.removeItem(viewTransitionKey);return value?JSON.parse(value) as Partial<StatisticsView>:null;}catch{return null;}})();

function Statistics(){
  const [identity,setIdentity]=useState<{room:string;player:string}|null>(null);
  const [sessions,setSessions]=useState<DiceSession[]>([]);
  const [selected,setSelected]=useState(restoredView?.selected??'');
  const [rolls,setRolls]=useState<StoredRoll[]>([]);
  const [tab,setTab]=useState<AnalyticsTab>(restoredView?.tab==='query'?'ledger':tabs.includes(restoredView?.tab as AnalyticsTab)?restoredView!.tab as AnalyticsTab:'overview');
  const [player,setPlayer]=useState(restoredView?.player??'');
  const [expression,setExpression]=useState(restoredView?.expression??'');
  const [maximized]=useState(new URLSearchParams(window.location.search).get('maximized')==='1');
  const controls=useRef<BroadcastChannel|null>(null);
  useEffect(()=>{if(!identity)return;const channel=new BroadcastChannel(PANEL_CHANNEL);controls.current=channel;return()=>{channel.close();controls.current=null;};},[identity]);
  const resize=()=>{
    if(!identity)return;
    try{sessionStorage.setItem(viewTransitionKey,JSON.stringify({selected,tab,player,expression} satisfies StatisticsView));}catch{/* Filters reset if storage is unavailable. */}
    controls.current?.postMessage({type:'statistics-size',roomId:identity.room,playerId:identity.player,maximized:!maximized} satisfies PanelMessage);
  };
  const close=()=>{if(identity)controls.current?.postMessage({type:'statistics-close',roomId:identity.room,playerId:identity.player} satisfies PanelMessage);};
  useEffect(()=>{
    let active=true,offTheme:(()=>void)|undefined,offMetadata:(()=>void)|undefined;
    OBR.onReady(async()=>{
      if(!active)return;
      const room=OBR.room.id,player=OBR.player.id;
      setIdentity({room,player});
      try{applyOwlbearTheme(await OBR.theme.getTheme());offTheme=OBR.theme.onChange(applyOwlbearTheme);}catch{/* CSS fallback */}
      const refresh=async()=>{const metadata=await OBR.room.getMetadata(),settings=readRoomSettings(metadata),shared=readSharedSession(metadata),previous=settings.overrideMode?.enabled?settings.overrideMode.previousSession:undefined;
        await migrateHistory(room,player,previous??shared);await synchronizeRoomSession(room,player,shared,previous);
        const all=await listSessions(room,player);if(active){setSessions(all);setSelected(value=>all.some(item=>item.id===value)&&!(shared?.kind==='override'&&value!==shared.id)?value:shared?.id??all.find(s=>!s.endedAt)?.id??all[0]?.id??'');}};
      await refresh().catch(()=>{});
      offMetadata=OBR.room.onMetadataChange(()=>{void refresh().catch(()=>{});});
    });
    return()=>{active=false;offTheme?.();offMetadata?.();};
  },[]);
  useEffect(()=>{if(!identity||!selected)return;let active=true;void getSessionRolls(identity.room,identity.player,selected).then(value=>{if(active)setRolls(value);});return()=>{active=false;};},[identity,selected]);
  useEffect(()=>{if(!identity||!selected)return;const channel=new BroadcastChannel(LEDGER_CHANNEL);channel.onmessage=event=>{if(event.data?.roomId===identity.room&&event.data?.playerId===identity.player)void getSessionRolls(identity.room,identity.player,selected).then(setRolls);};return()=>channel.close();},[identity,selected]);
  const filtered=useMemo(()=>filterRolls(rolls,{player,expression}),[rolls,player,expression]);
  const players=useMemo(()=>playerStats(rolls),[rolls]);
  const expressions=useMemo(()=>expressionStats(rolls),[rolls]);
  const selectedSession=sessions.find(item=>item.id===selected);
  return <main className={`statistics-window${maximized?' maximized':''}`}>
    <header><img className="header-icon" src="./icon.svg" alt="" aria-hidden="true"/><div><h1>Session Statistics</h1><p>Based on rolls visible to you.</p></div><div className="statistics-header-actions"><button type="button" aria-label={maximized?'Restore statistics window':'Maximize statistics window'} title={maximized?'Restore':'Maximize'} aria-pressed={maximized} disabled={!identity} onClick={resize}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{maximized?<><rect x="5" y="7" width="13" height="13" rx="1"/><path d="M8 7V4h12v12h-2"/></>:<rect x="4" y="4" width="16" height="16" rx="1"/>}</svg></button><button type="button" aria-label="Close statistics" title="Close" disabled={!identity} onClick={close}>×</button></div></header>
    <div className="statistics-content">
      <label className="session-select">Session <select value={selected} onChange={event=>{setSelected(event.target.value);setPlayer('');setExpression('');}}>{sessions.map(item=><option key={item.id} value={item.id}>{item.endedAt?item.name:`Current Session · ${item.name}`}</option>)}</select></label>
      <div className="shared-filters"><label>Player <select value={player} onChange={event=>setPlayer(event.target.value)}><option value="">All</option>{players.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Expression <select value={expression} onChange={event=>setExpression(event.target.value)}><option value="">All</option>{expressions.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{(player||expression)&&<button type="button" onClick={()=>{setPlayer('');setExpression('');}}>Clear filters</button>}</div>
      <nav className="statistics-tabs" aria-label="Statistics view">{tabs.map(item=><button key={item} type="button" aria-current={tab===item?'page':undefined} onClick={()=>setTab(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</nav>
      <AnalyticsTabs tab={tab} rolls={filtered} sessionRolls={rolls} session={selectedSession} sessionName={selectedSession?.name??'Current Session'} player={player} expression={expression} onPlayer={setPlayer} onExpression={setExpression} roomId={identity?.room??''} viewerId={identity?.player??''}/>    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Statistics/></StrictMode>);
