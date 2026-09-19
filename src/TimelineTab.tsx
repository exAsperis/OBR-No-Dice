import { useMemo, useState } from 'react';
import type { StoredRoll } from './sessionLedger';
import { expressionLabel, percentile, type PercentileResult } from './analytics';
import { buildTimelineBands, collapseEmptyTimelineBands, timelineMarkerSize } from './timelineStats';
import { PlayerName } from './components/PlayerName';
import { usePlayerColor } from './components/usePlayerColor';
import { HelpTerm } from './components/HelpTerm';

const display=(value:StoredRoll['finalResult'])=>Array.isArray(value)?`[${value.join(', ')}]`:String(value);
const time=(value:number,seconds=false)=>new Date(value).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',...(seconds?{second:'2-digit' as const}:{})});

function TimelineRoll({roll,position,roomId,viewerId}:{roll:StoredRoll;position:PercentileResult|null;roomId:string;viewerId:string}){
  const color=usePlayerColor(roomId,viewerId,roll.rollerId),size=timelineMarkerSize(position?.score);
  const lines=[`${roll.rollerName} · ${time(roll.timestamp,true)}`,`${expressionLabel(roll.normalizedExpression)} → ${display(roll.finalResult)}`];
  if(roll.result.interpretation)lines.push(roll.result.interpretation);
  if(position)lines.push(`Percentile: ${position.exact?'':'~'}${(position.score*100).toFixed(1)}%${position.exact?'':' (estimated)'}`);
  const tooltip=lines.join('\n');
  return <span className="timeline-roll" role="img" tabIndex={0} aria-label={tooltip} title={tooltip} style={{width:size,height:size,backgroundColor:color??'var(--muted)'}}/>;
}

export function TimelineTab({rolls,roomId,viewerId}:{rolls:StoredRoll[];roomId:string;viewerId:string}){
  const [minutes,setMinutes]=useState('10');
  const bandMinutes=Number.isFinite(Number(minutes))&&Number(minutes)>0?Number(minutes):10;
  const bands=useMemo(()=>collapseEmptyTimelineBands(buildTimelineBands(rolls,bandMinutes)),[rolls,bandMinutes]);
  const positions=useMemo(()=>new Map(rolls.map(roll=>[roll.id,percentile(roll)])),[rolls]);
  const players=useMemo(()=>{const result:{id:string;name:string}[]=[],seen=new Set<string>();for(const roll of [...rolls].sort((a,b)=>a.timestamp-b.timestamp))if(!seen.has(roll.rollerId)){seen.add(roll.rollerId);result.push({id:roll.rollerId,name:roll.rollerName});}return result;},[rolls]);
  return <section className="timeline-tab"><h2>Timeline</h2>{!rolls.length?<p>No rolls yet.</p>:<><div className="timeline-controls"><label><HelpTerm help="bandDuration">Band duration (minutes)</HelpTerm><input type="number" min="1" step="1" value={minutes} onChange={event=>setMinutes(event.target.value)}/></label></div><p className="filter-summary">{bandMinutes}-minute bands · {rolls.length} rolls<br/>Rolls run left to right in chronological order.</p><div className="timeline-legend" aria-label="Players">{players.map(player=><PlayerName key={player.id} roomId={roomId} viewerId={viewerId} playerId={player.id} name={player.name}/>)}</div><div className="timeline-size-legend"><strong><HelpTerm help="normalizedResultSize">Size:</HelpTerm></strong>{[['Low',6],['Middle',12],['High',18]].map(([label,size])=><span key={label as string}><i style={{width:size as number,height:size as number}}/>{label}</span>)}</div><p className="timeline-size-help">Disk size represents normalized result percentile. Rolls without a numeric reference distribution use the middle size.</p><div className="timeline-bands">{bands.map(band=><div className={`timeline-band${band.bandCount>1?' timeline-band-gap':''}`} key={band.start}><time className="timeline-band-time" dateTime={new Date(band.start).toISOString()} title={`${new Date(band.start).toLocaleString()} – ${new Date(band.end).toLocaleString()}`}>{band.bandCount>1?<>{time(band.start)}–{time(band.end)}<small>{band.bandCount} empty bands</small></>:time(band.start)}</time><div className="timeline-band-rolls">{band.rolls.map(roll=><TimelineRoll key={roll.id} roll={roll} position={positions.get(roll.id)??null} roomId={roomId} viewerId={viewerId}/>)}</div></div>)}</div></>}</section>;
}
