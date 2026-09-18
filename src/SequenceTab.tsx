import { useMemo, useState } from 'react';
import type { StoredRoll } from './sessionLedger';
import { buildSequenceAnalysis, type ResultComparison } from './sequenceStats';

const display=(value:StoredRoll['finalResult'])=>Array.isArray(value)?`[${value.join(', ')}]`:String(value);
export function SequenceTab({rolls}:{rolls:StoredRoll[]}){
  const available=useMemo(()=>[...new Map(rolls.map(roll=>[roll.rollerId,roll.rollerName])).entries()].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name)),[rolls]);
  const [chosen,setChosen]=useState<string[]|null>(null);
  const [pattern,setPattern]=useState('');
  const [comparison,setComparison]=useState<ResultComparison>('any');
  const [value,setValue]=useState('6');
  const selected=chosen??available.map(item=>item.id);
  const numeric=Number(value);
  const valid=comparison==='any'||(value.trim()!==''&&Number.isFinite(numeric));
  const analysis=useMemo(()=>valid?buildSequenceAnalysis(rolls,pattern,selected,comparison,numeric):{entries:[],players:[],eligible:0,matching:0,error:'Enter a numeric result value.'},[rolls,pattern,chosen,comparison,numeric,valid]);
  const selectedSet=new Set(selected);
  const toggle=(id:string)=>setChosen(previous=>{const current=new Set(previous??available.map(item=>item.id));if(current.has(id))current.delete(id);else current.add(id);return [...current];});
  return <section className="sequence-tab" aria-label="Roll sequence">
    <p className="sequence-help">Match normalized expressions with a regular expression. The result filter uses the final outcome of each roll.</p>
    <div className="sequence-controls"><label>Expression regex<input type="text" value={pattern} onChange={event=>setPattern(event.target.value)} placeholder="^2d6(?:[+-]\d+)?$" maxLength={200} spellCheck={false}/></label><label>Result<select value={comparison} onChange={event=>setComparison(event.target.value as ResultComparison)}><option value="any">Any</option><option value="=">=</option><option value="<=">≤</option><option value=">=">≥</option></select></label>{comparison!=='any'&&<label>Value<input type="number" value={value} onChange={event=>setValue(event.target.value)}/></label>}</div>
    <fieldset className="sequence-players"><legend>Players</legend><div className="sequence-player-actions"><button type="button" onClick={()=>setChosen(null)}>Select all</button><button type="button" onClick={()=>setChosen([])}>Clear all</button></div><div className="sequence-player-list">{available.map(item=><label key={item.id}><input type="checkbox" checked={selectedSet.has(item.id)} onChange={()=>toggle(item.id)}/>{item.name}</label>)}</div></fieldset>
    {analysis.error?<p className="input-error" role="alert">{analysis.error}</p>:<><p className="filter-summary">{analysis.matching} of {analysis.eligible} expression-matched rolls shown{comparison==='any'?'.':` (${analysis.eligible?(analysis.matching/analysis.eligible*100).toFixed(1):'0.0'}%).`}</p><div className="sequence-scroll"><table><thead><tr><th scope="col">#</th><th scope="col">Time</th><th scope="col">Expression</th>{analysis.players.map(player=><th scope="col" key={player.playerId}>{player.name}</th>)}</tr></thead><tbody>{analysis.entries.map((entry,index)=><tr key={entry.roll.id}><td>{index+1}</td><td>{new Date(entry.roll.timestamp).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</td><td><code>{entry.roll.normalizedExpression.slice(entry.roll.normalizedExpression.indexOf(':')+1)}</code></td>{analysis.players.map(player=><td key={player.playerId}>{player.playerId===entry.roll.rollerId?display(entry.roll.finalResult):''}</td>)}</tr>)}</tbody><tfoot><tr><th colSpan={3}>Matching rolls</th>{analysis.players.map(player=><td key={player.playerId}>{player.matching}</td>)}</tr><tr><th colSpan={3}>Expression-matched rolls</th>{analysis.players.map(player=><td key={player.playerId}>{player.eligible}</td>)}</tr><tr><th colSpan={3}>Match rate</th>{analysis.players.map(player=><td key={player.playerId}>{(player.rate*100).toFixed(1)}%</td>)}</tr><tr><th colSpan={3}>Mean shown result</th>{analysis.players.map(player=><td key={player.playerId}>{player.mean?.toFixed(2)??'—'}</td>)}</tr></tfoot></table></div></>}
  </section>;
}
