import { useMemo, type ReactNode } from 'react';
import type { DiceSession, StoredRoll } from './sessionLedger';
import { summary } from './analytics';
import { LedgerTab } from './LedgerTab';
import { PlayerName } from './components/PlayerName';
import { PlayersTab } from './PlayersTab';
import { TimelineTab } from './TimelineTab';
import { OutcomesTab } from './OutcomesTab';
import { ExpressionsTab } from './ExpressionsTab';
import { HighlightsTab } from './HighlightsTab';
import { FairnessTab } from './FairnessTab';

export type AnalyticsTab='overview'|'players'|'expressions'|'outcomes'|'highlights'|'timeline'|'ledger'|'fairness';
export const tabs:AnalyticsTab[]=['overview','players','expressions','outcomes','highlights','timeline','ledger','fairness'];
const n=(v:number|null|undefined)=>v==null?'—':Number.isInteger(v)?String(v):v.toFixed(2);
const when=(v:number|undefined)=>v==null?'—':new Date(v).toLocaleString();
const span=(v:number)=>v<60_000?`${Math.round(v/1000)} sec`:v<3_600_000?`${(v/60_000).toFixed(1)} min`:`${(v/3_600_000).toFixed(1)} hr`;
const name=(roomId:string,viewerId:string,id:string,label:string)=><PlayerName roomId={roomId} viewerId={viewerId} playerId={id} name={label}/>;
const ranked=(r:{names:string[];count:number}|null,rolls:StoredRoll[],roomId:string,viewerId:string)=>r? <>{r.names.map((label,index)=><span key={`${label}-${index}`}>{index>0&&' and '}{name(roomId,viewerId,rolls.find(item=>item.rollerName===label)?.rollerId??label,label)}</span>)} — {r.count}</>:'—';
const rankedText=(r:{names:string[];count:number}|null)=>r?`${r.names.join(' and ')} — ${r.count}`:'—';
function Card({label,value}:{label:string;value:ReactNode}){return <div className="stat-card"><small>{label}</small><strong>{value}</strong></div>;}
export function AnalyticsTabs({tab,rolls,session,sessionName,roomId,viewerId}:{tab:AnalyticsTab;rolls:StoredRoll[];session:DiceSession|undefined;sessionName:string;roomId:string;viewerId:string}){
  const box=useMemo(()=>summary(rolls),[rolls]);
  if(tab==='ledger')return <LedgerTab rolls={rolls} session={session} roomId={roomId} viewerId={viewerId}/>;
  if(tab==='overview')return <><h2>{sessionName}</h2><div className="headline-stats"><div><strong>{box.rolls}</strong><span>rolls</span></div><div><strong>{box.dice}</strong><span>dice</span></div><div><strong>{box.players}</strong><span>rollers</span></div><div><strong>{box.expressions}</strong><span>expressions</span></div></div><section className="stat-grid"><Card label="🟢 First roll" value={when(box.first)}/><Card label="🏁 Last roll" value={when(box.last)}/><Card label="⌛ Elapsed" value={box.rolls?span(box.duration):'—'}/><Card label="🕐 Rolls/hour" value={n(box.perHour)}/><Card label="🤸 Most active roller" value={ranked(box.most,rolls,roomId,viewerId)}/><Card label="🥱 Least active roller" value={ranked(box.least,rolls,roomId,viewerId)}/><Card label="🔁 Most-used expression" value={rankedText(box.expression)}/><Card label="🎲 Most common die" value={rankedText(box.die)}/><Card label="⏳ Longest gap" value={box.rolls>1?span(box.longestGap):'—'}/><Card label="😅 Busiest 10 minutes" value={`${box.busiestTen.count} rolls`}/></section></>;
  if(tab==='players')return <PlayersTab rolls={rolls} roomId={roomId} viewerId={viewerId}/>;
  if(tab==='expressions')return <ExpressionsTab rolls={rolls} roomId={roomId} viewerId={viewerId}/>;
  if(tab==='outcomes')return <OutcomesTab rolls={rolls} roomId={roomId} viewerId={viewerId}/>;
  if(tab==='highlights')return <HighlightsTab rolls={rolls} roomId={roomId} viewerId={viewerId}/>;
  if(tab==='timeline')return <TimelineTab rolls={rolls} roomId={roomId} viewerId={viewerId}/>;
  return <FairnessTab rolls={rolls} roomId={roomId} viewerId={viewerId}/>;
}
