import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StoredRoll } from './sessionLedger';
import { playerStats } from './analytics';
import { buildQueryAnalysis, type ResultComparison } from './sequenceStats';
import { deletePlayerStatistic, loadPlayerStatistics, normalizePlayerStatisticDieType, replacePlayerStatistic, type PlayerStatisticAggregate, type SavedPlayerStatistic } from './playerStatistics';
import { HelpTerm } from './components/HelpTerm';
import { PlayerName } from './components/PlayerName';

const operators:ResultComparison[]=['any','=','<=','>='];
const operatorLabel=(value:ResultComparison)=>value==='any'?'Any':value==='<='?'≤':value==='>='?'≥':'=';
const aggregateLabel=(value:PlayerStatisticAggregate)=>value[0].toUpperCase()+value.slice(1);
const number=(value:number)=>Number.isInteger(value)?String(value):value.toFixed(2);
const blank=():SavedPlayerStatistic=>({id:crypto.randomUUID(),name:'',aggregate:'count',pattern:'',resultComparison:'any',resultValue:6,rollComparison:'any',rollValue:20,rollDie:''});

export function PlayersTab({rolls,roomId,viewerId}:{rolls:StoredRoll[];roomId:string;viewerId:string}){
  const players=useMemo(()=>playerStats(rolls),[rolls]);
  const [statistics,setStatistics]=useState<SavedPlayerStatistic[]>(()=>loadPlayerStatistics(viewerId));
  const [editing,setEditing]=useState<SavedPlayerStatistic|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{setStatistics(loadPlayerStatistics(viewerId));setEditing(null);setError('');},[viewerId]);
  const playerIds=useMemo(()=>players.map(player=>player.id),[players]);
  const custom=useMemo(()=>statistics.map(statistic=>({statistic,analysis:buildQueryAnalysis(rolls,{pattern:statistic.pattern,selectedPlayers:playerIds,result:{comparison:statistic.resultComparison,value:statistic.resultValue},roll:{comparison:statistic.rollComparison,value:statistic.rollValue,dieType:statistic.rollDie||undefined}})})),[rolls,statistics,playerIds]);
  const update=<K extends keyof SavedPlayerStatistic>(key:K,value:SavedPlayerStatistic[K])=>setEditing(current=>current?{...current,[key]:value}:current);
  const save=()=>{
    if(!editing)return;const name=editing.name.trim();
    if(!name){setError('Name is required.');return;}
    try{new RegExp(editing.pattern,'i');}catch{setError('Expression regex is invalid.');return;}
    if(editing.resultComparison!=='any'&&!Number.isFinite(editing.resultValue)){setError('Result value must be numeric.');return;}
    if(editing.rollComparison!=='any'&&!Number.isFinite(editing.rollValue)){setError('Roll value must be numeric.');return;}
    const rollDie=editing.rollComparison==='any'?'':normalizePlayerStatisticDieType(editing.rollDie);
    if(rollDie===null){setError('Roll die must be a die type such as d6 or d20.');return;}
    setStatistics(current=>replacePlayerStatistic(viewerId,current,{...editing,name,rollDie}));setEditing(null);setError('');
  };
  return <section className="players-tab">
    <h2>Players</h2>
    {!players.length?<p>No player rolls in this session.</p>:<div className="players-comparison-scroll"><table className="players-comparison"><thead><tr><th scope="col">Statistic</th>{players.map(player=><th scope="col" key={player.id}><PlayerName roomId={roomId} viewerId={viewerId} playerId={player.id} name={player.name}/></th>)}</tr></thead><tbody><tr className="players-section"><th colSpan={players.length+1}>Session</th></tr>{[
      {label:'Rolls', help:'', value:(player:typeof players[number])=>player.rolls},
      {label:'Dice', help:'', value:(player:typeof players[number])=>player.dice},
      {label:'Expressions used', help:'expression', value:(player:typeof players[number])=>player.expressions},
      {label:'Average percentile', help:'averagePercentile', value:(player:typeof players[number])=><span title={`${player.qualifying} qualifying rolls: ${player.exactQualifying} exact, ${player.estimatedQualifying} estimated`}>{player.average===null?'—':`${(player.average*100).toFixed(1)}%`}</span>},
      {label:'First roll', help:'', value:(player:typeof players[number])=>new Date(player.first).toLocaleString()},
      {label:'Last roll', help:'', value:(player:typeof players[number])=>new Date(player.last).toLocaleString()},
    ].map(({label,help,value})=><tr key={label}><th scope="row">{help ? <HelpTerm help={help as any}>{label}</HelpTerm> : label}</th>{players.map(player=><td key={player.id}>{(value as (player:typeof players[number])=>ReactNode)(player)}</td>)}</tr>)}</tbody>{custom.map(({statistic,analysis})=><tbody key={statistic.id}><tr className="players-section"><th scope="row"><span>{statistic.name} · {aggregateLabel(statistic.aggregate)}</span><span className="player-stat-actions"><button type="button" aria-label={`Edit ${statistic.name}`} onClick={()=>{setEditing({...statistic});setError('');}}>Edit</button><button type="button" aria-label={`Delete ${statistic.name}`} onClick={()=>setStatistics(current=>deletePlayerStatistic(viewerId,current,statistic.id))}>Delete</button></span>{analysis.error&&<small title={analysis.error}>Invalid filter</small>}</th>{players.map(player=>{const result=analysis.players.find(item=>item.playerId===player.id);let value:string|number='—';if(!analysis.error&&result)value=statistic.aggregate==='count'?result.matching:statistic.aggregate==='sum'?(result.numericCount?number(result.sum):'—'):(result.mean===null?'—':number(result.mean));return <td key={player.id}>{value}</td>;})}</tr></tbody>)}</table></div>}
    <div className="player-stat-heading"><h3>Custom statistics</h3><button type="button" onClick={()=>{setEditing(blank());setError('');}}>Add statistic</button></div>
    {!statistics.length&&<p className="filter-summary">Add a custom statistic to compare filtered roll results by player.</p>}
    {editing&&<div className="player-stat-editor"><label>Name<input value={editing.name} onChange={event=>update('name',event.target.value)}/></label><label>Aggregate<select value={editing.aggregate} onChange={event=>update('aggregate',event.target.value as PlayerStatisticAggregate)}><option value="count">Count</option><option value="sum">Sum</option><option value="average">Average</option></select></label><label>Expression regex<input value={editing.pattern} onChange={event=>update('pattern',event.target.value)} spellCheck={false}/></label><label>Result<select value={editing.resultComparison} onChange={event=>update('resultComparison',event.target.value as ResultComparison)}>{operators.map(value=><option key={value} value={value}>{operatorLabel(value)}</option>)}</select></label>{editing.resultComparison!=='any'&&<label>Result value<input type="number" value={Number.isFinite(editing.resultValue)?editing.resultValue:''} onChange={event=>update('resultValue',event.target.value===''?Number.NaN:Number(event.target.value))}/></label>}<label>Roll<select value={editing.rollComparison} onChange={event=>update('rollComparison',event.target.value as ResultComparison)}>{operators.map(value=><option key={value} value={value}>{operatorLabel(value)}</option>)}</select></label>{editing.rollComparison!=='any'&&<><label>Roll value<input type="number" value={Number.isFinite(editing.rollValue)?editing.rollValue:''} onChange={event=>update('rollValue',event.target.value===''?Number.NaN:Number(event.target.value))}/></label><label><HelpTerm help="rollDie">Roll die</HelpTerm><input value={editing.rollDie} onChange={event=>update('rollDie',event.target.value)} placeholder="Any die" spellCheck={false}/></label></>}<p className="filter-summary">Count includes every matching roll. Sum and Average use numeric final results only.</p>{error&&<p className="input-error" role="alert">{error}</p>}<div className="player-stat-editor-actions"><button type="button" onClick={save}>Save</button><button type="button" onClick={()=>{setEditing(null);setError('');}}>Cancel</button></div></div>}
  </section>;
}
