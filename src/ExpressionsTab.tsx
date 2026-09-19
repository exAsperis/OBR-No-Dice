import { useMemo, useState, type ReactNode } from 'react';
import { expressionStats } from './analytics';
import { PlayerName } from './components/PlayerName';
import { distributionBarPercent } from './outcomesStats';
import type { StoredRoll } from './sessionLedger';
import { HelpTerm } from './components/HelpTerm';

type ExpressionStat=ReturnType<typeof expressionStats>[number];
interface ComparisonRow {value:number|string;observed:number;expected:number|null}

const number=(value:number|null|undefined)=>value==null?'—':Number.isInteger(value)?String(value):value.toFixed(2);
const range=(minimum:number|null,maximum:number|null)=>minimum==null||maximum==null?'—':`${number(minimum)}–${number(maximum)}`;
const delta=(observed:number|null,expected:number|null)=>observed==null||expected==null?'—':Math.abs(observed-expected)<.005?'0':`${observed-expected>0?'+':''}${(observed-expected).toFixed(2)}`;
const percent=(value:number|null)=>value==null?'—':`${(value*100).toFixed(1)}%`;
const points=(value:number|null)=>value==null?'—':Math.abs(value)<.0005?'0.0 pp':`${value>0?'+':''}${(value*100).toFixed(1)} pp`;
const dialectName=(dialect:ExpressionStat['dialect'])=>dialect==='roll20'?'Roll20':'No Dice';
function Card({label,value}:{label:string;value:ReactNode}){return <div className="stat-card"><small>{label}</small><strong>{value}</strong></div>;}

function displayLabel(expression:ExpressionStat,ambiguous:Set<string>){return <><code>{expression.label}</code>{ambiguous.has(expression.label)&&<small className="expression-dialect"> · {dialectName(expression.dialect)}</small>}</>;}

function comparisonRows(expression:ExpressionStat):ComparisonRow[]{
  const rows=new Map<string,ComparisonRow>();
  for(const entry of expression.chart?.entries??[]){const value=entry.value as number;rows.set(`number:${value}`,{value,observed:0,expected:entry.probability});}
  for(const entry of expression.distribution.rows){const key=`${typeof entry.value}:${entry.value}`,existing=rows.get(key);if(existing)existing.observed=entry.count;else rows.set(key,{value:entry.value,observed:entry.count,expected:null});}
  return [...rows.values()].sort((a,b)=>typeof a.value==='number'&&typeof b.value==='number'?a.value-b.value:typeof a.value==='number'?-1:typeof b.value==='number'?1:String(a.value).localeCompare(String(b.value)));
}

export function ExpressionsTab({rolls,roomId,viewerId}:{rolls:StoredRoll[];roomId:string;viewerId:string}){
  const [selectedExpressionId,setSelectedExpressionId]=useState('');
  const expressions=useMemo(()=>expressionStats(rolls),[rolls]);
  const ambiguous=useMemo(()=>{const counts=new Map<string,number>();for(const expression of expressions)counts.set(expression.label,(counts.get(expression.label)??0)+1);return new Set([...counts].filter(([,count])=>count>1).map(([label])=>label));},[expressions]);
  const selected=expressions.find(expression=>expression.id===selectedExpressionId);
  const rows=useMemo(()=>selected?comparisonRows(selected):[],[selected]);
  const players=useMemo(()=>selected?[...new Map(selected.list.map(roll=>[roll.rollerId,roll.rollerName])).entries()]:[],[selected]);
  const maxObserved=Math.max(0,...rows.map(row=>row.observed));
  const toggle=(id:string)=>setSelectedExpressionId(current=>current===id?'':id);
  return <section className="expressions-tab"><h2>Expressions</h2>{!expressions.length?<p>No rolls yet.</p>:<><div className="stat-scroll expressions-summary-table"><table><thead><tr>{['Expression','Rolls','Players','Observed mean','Expected mean','Δ mean','Observed range','Expected range'].map(label=><th key={label}>{label==='Observed mean'?<HelpTerm help="observedMean">Observed mean</HelpTerm>:label==='Expected mean'?<HelpTerm help="expectedMean">Expected mean</HelpTerm>:label==='Δ mean'?<HelpTerm help="deltaMean">Δ mean</HelpTerm>:label==='Observed range'?<HelpTerm help="observedRange">Observed range</HelpTerm>:label==='Expected range'?<HelpTerm help="expectedRange">Expected range</HelpTerm>:label}</th>)}</tr></thead><tbody>{expressions.map(expression=><tr key={expression.id} tabIndex={0} aria-selected={expression.id===selectedExpressionId} className={expression.id===selectedExpressionId?'selected':undefined} onClick={()=>toggle(expression.id)} onKeyDown={event=>{if(event.key==='Enter')toggle(expression.id);}}><td>{displayLabel(expression,ambiguous)}</td><td>{expression.rolls}</td><td>{expression.rollers}</td><td>{number(expression.observed)}</td><td>{number(expression.expected)}</td><td>{delta(expression.observed,expression.expected)}</td><td>{range(expression.min,expression.max)}</td><td>{expression.range?`${number(expression.range[0])}–${number(expression.range[1])}`:'—'}</td></tr>)}</tbody></table></div>{selected&&<section className="expression-detail"><h3>{displayLabel(selected,ambiguous)} · {selected.rolls} rolls</h3><div className="stat-grid expression-detail-summary"><Card label="Rolls" value={selected.rolls}/><Card label="Players" value={selected.rollers}/><Card label="Numeric results" value={selected.numericCount}/><Card label="Observed mean" value={number(selected.observed)}/><Card label="Expected mean" value={number(selected.expected)}/><Card label="Δ mean" value={delta(selected.observed,selected.expected)}/><Card label="Observed range" value={range(selected.min,selected.max)}/><Card label="Expected range" value={selected.range?`${number(selected.range[0])}–${number(selected.range[1])}`:'—'}/></div><p className="filter-summary">{selected.chart?'Exact theoretical distribution available.':'Exact theoretical distribution unavailable for this expression.'}</p><div className="expression-players"><h3>Players</h3>{players.map(([id,name],index)=><span key={id}>{index>0&&' · '}<PlayerName roomId={roomId} viewerId={viewerId} playerId={id} name={name}/></span>)}</div><h3>Observed result distribution</h3><div className="outcome-distribution expression-distribution"><table><thead><tr><th>Outcome</th><th>Observed count</th><th>Observed %</th><th>Distribution</th>{selected.chart&&<><th>Expected %</th><th>Difference</th></>}</tr></thead><tbody>{rows.slice(0,200).map(row=>{const observedRate=selected.rolls?row.observed/selected.rolls:0;return <tr key={`${typeof row.value}:${row.value}`}><td>{row.value}</td><td>{row.observed}</td><td>{percent(observedRate)}</td><td className="outcome-bar-cell"><span className="outcome-bar-track"><span className="outcome-bar" style={{width:`${distributionBarPercent(row.observed,maxObserved)}%`}}/></span></td>{selected.chart&&<><td>{percent(row.expected)}</td><td>{points(row.expected==null?null:observedRate-row.expected)}</td></>}</tr>;})}</tbody></table>{rows.length>200&&<p className="filter-summary">Showing first 200 of {rows.length} distinct outcomes.</p>}</div></section>}</>}</section>;
}
