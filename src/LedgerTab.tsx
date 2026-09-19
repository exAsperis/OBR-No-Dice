import { useMemo, useState } from 'react';
import type { DiceSession, StoredRoll } from './sessionLedger';
import { downloadText, exportSessionCsv, exportSessionJson } from './sessionExport';
import { buildQueryAnalysis, type ResultComparison } from './sequenceStats';
import { dieType, outcomeDistribution, playerStats, summary } from './analytics';
import { QUERY_PRESETS, type QueryPreset } from './queryPresets';
import { PlayerName } from './components/PlayerName';

const display=(value:StoredRoll['finalResult'])=>Array.isArray(value)?`[${value.join(', ')}]`:String(value);
const operators:ResultComparison[]=['any','=','<=','>='];
const operatorLabel=(operator:ResultComparison)=>operator==='any'?'Any':operator==='>='?'≥':operator==='<='?'≤':'=';

export function LedgerTab({rolls,sessionRolls,session,roomId='',viewerId=''}:{rolls:StoredRoll[];sessionRolls:StoredRoll[];session?:DiceSession;roomId?:string;viewerId?:string}){
  const available=useMemo(()=>[...new Map(rolls.map(roll=>[roll.rollerId,roll.rollerName])).entries()].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name)),[rolls]);
  const allDieTypes=useMemo(()=>[...new Set(rolls.flatMap(roll=>roll.resolution.dice.map(draw=>dieType(roll,draw))))].sort(),[rolls]);
  const categories=useMemo(()=>[...new Set(rolls.map(roll=>roll.result.interpretation).filter((value):value is string=>Boolean(value)))].sort(),[rolls]);
  const [chosen,setChosen]=useState<string[]|null>(null);
  const [pattern,setPattern]=useState('');
  const [resultComparison,setResultComparison]=useState<ResultComparison>('any');
  const [resultValue,setResultValue]=useState('6');
  const [rollComparison,setRollComparison]=useState<ResultComparison>('any');
  const [rollValue,setRollValue]=useState('20');
  const [rollDie,setRollDie]=useState('');
  const [mode,setMode]=useState<'results'|'dice'>('results');
  const [outcomeDie,setOutcomeDie]=useState('');
  const [category,setCategory]=useState('');
  const [from,setFrom]=useState('');
  const [until,setUntil]=useState('');
  const selected=chosen??available.map(item=>item.id);
  const resultNumber=Number(resultValue),rollNumber=Number(rollValue);
  const validResult=resultComparison==='any'||(resultValue.trim()!==''&&Number.isFinite(resultNumber));
  const validRoll=rollComparison==='any'||(rollValue.trim()!==''&&Number.isFinite(rollNumber));
  const analysis=useMemo(()=>validResult&&validRoll?buildQueryAnalysis(rolls,{pattern,selectedPlayers:selected,result:{comparison:resultComparison,value:resultNumber},roll:{comparison:rollComparison,value:rollNumber,dieType:rollDie||undefined},category,from:from?new Date(from).getTime():undefined,until:until?new Date(until).getTime()+60_000:undefined}):{entries:[],players:[],eligible:0,matching:0,error:'Enter a numeric filter value.'},[rolls,pattern,chosen,resultComparison,resultNumber,rollComparison,rollNumber,rollDie,category,from,until,validResult,validRoll]);
  const matched=useMemo(()=>analysis.entries.map(entry=>entry.roll),[analysis]);
  const filenameBase=`no-dice-${(session?.name??'session').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').replace(/-(\d{2})-(\d{2})$/,'-$1$2')||'session'}`;
  const exportRolls=(kind:'results'|'session-csv'|'session-json')=>{
    if(!session)return;
    if(kind==='results')downloadText(`${filenameBase}-results.csv`,exportSessionCsv(session,matched),'text/csv;charset=utf-8');
    else if(kind==='session-csv')downloadText(`${filenameBase}-session.csv`,exportSessionCsv(session,sessionRolls),'text/csv;charset=utf-8');
    else downloadText(`${filenameBase}-session.json`,exportSessionJson(session,sessionRolls),'application/json;charset=utf-8');
  };
  const totals=useMemo(()=>summary(matched),[matched]);
  const playersStats=useMemo(()=>playerStats(matched),[matched]);
  const dieTypes=useMemo(()=>[...new Set(matched.flatMap(roll=>roll.resolution.dice.map(draw=>dieType(roll,draw))))].sort(),[matched]);
  const effectiveOutcomeDie=dieTypes.includes(outcomeDie)?outcomeDie:rollDie&&dieTypes.includes(rollDie)?rollDie:dieTypes[0];
  const outcomes=useMemo(()=>outcomeDistribution(matched,mode,mode==='dice'?effectiveOutcomeDie:undefined),[matched,mode,effectiveOutcomeDie]);
  const qualifying=playersStats.reduce((count,item)=>count+item.qualifying,0);
  const average=qualifying?playersStats.reduce((sum,item)=>sum+(item.average??0)*item.qualifying,0)/qualifying:null;
  const selectedSet=new Set(selected);
  const toggle=(id:string)=>setChosen(previous=>{const current=new Set(previous??available.map(item=>item.id));if(current.has(id))current.delete(id);else current.add(id);return [...current];});
  const applyPreset=(preset:QueryPreset)=>{
    setPattern(preset.pattern);
    setResultComparison(preset.result?.comparison??'any');
    setResultValue(String(preset.result?.value??6));
    setRollComparison(preset.roll?.comparison??'any');
    setRollValue(String(preset.roll?.value??20));
    setRollDie(preset.roll?.dieType??'');
    setMode(preset.mode??'results');
    setOutcomeDie(preset.roll?.dieType??'');
    setChosen(null);setCategory('');setFrom('');setUntil('');
  };
  return <section className="sequence-tab" aria-label="Ledger">
    <details className="ledger-export"><summary>Export</summary><div><button type="button" disabled={!session||matched.length===0} onClick={()=>exportRolls('results')}>CSV · Current Results</button><button type="button" disabled={!session} onClick={()=>exportRolls('session-csv')}>CSV · Entire Session</button><button type="button" disabled={!session} onClick={()=>exportRolls('session-json')}>JSON · Entire Session</button></div></details>
    <p className="sequence-help">Result checks the final expression value. Roll checks any individual die draw in the matching record, including rerolls and explosions. Shared Statistics filters also apply.</p>
    <div className="query-presets" aria-label="Query shortcuts"><strong>Shortcuts</strong>{QUERY_PRESETS.map(preset=><button key={preset.id} type="button" title={preset.description} onClick={()=>applyPreset(preset)}>{preset.label}</button>)}</div>
    <div className="sequence-controls">
      <label>Expression regex<input type="text" value={pattern} onChange={event=>setPattern(event.target.value)} placeholder="^2d6(?:[+-]\d+)?$" maxLength={200} spellCheck={false}/></label>
      <label>Result<select value={resultComparison} onChange={event=>setResultComparison(event.target.value as ResultComparison)}>{operators.map(operator=><option key={operator} value={operator}>{operatorLabel(operator)}</option>)}</select></label>
      {resultComparison!=='any'&&<label>Result value<input type="number" value={resultValue} onChange={event=>setResultValue(event.target.value)}/></label>}
      <label>Roll<select value={rollComparison} onChange={event=>setRollComparison(event.target.value as ResultComparison)}>{operators.map(operator=><option key={operator} value={operator}>{operatorLabel(operator)}</option>)}</select></label>
      {rollComparison!=='any'&&<><label>Roll value<input type="number" value={rollValue} onChange={event=>setRollValue(event.target.value)}/></label><label>Roll die<select value={rollDie} onChange={event=>setRollDie(event.target.value)}><option value="">Any die</option>{allDieTypes.map(type=><option key={type}>{type}</option>)}{rollDie&&!allDieTypes.includes(rollDie)&&<option>{rollDie}</option>}</select></label></>}
      <label>Category<select value={category} onChange={event=>setCategory(event.target.value)}><option value="">Any</option>{categories.map(item=><option key={item}>{item}</option>)}</select></label>
      <label>From<input type="datetime-local" value={from} onChange={event=>setFrom(event.target.value)}/></label>
      <label>Until<input type="datetime-local" value={until} onChange={event=>setUntil(event.target.value)}/></label>
    </div>
    <fieldset className="sequence-players"><legend>Players</legend><div className="sequence-player-actions"><button type="button" onClick={()=>setChosen(null)}>Select all</button><button type="button" onClick={()=>setChosen([])}>Clear all</button></div><div className="sequence-player-list">{available.map(item=><label key={item.id}><input type="checkbox" checked={selectedSet.has(item.id)} onChange={()=>toggle(item.id)}/><PlayerName roomId={roomId} viewerId={viewerId} playerId={item.id} name={item.name}/></label>)}</div></fieldset>
    {analysis.error?<p className="input-error" role="alert">{analysis.error}</p>:<>
      <p className="filter-summary">{analysis.matching} of {analysis.eligible} expression-matched rolls shown.</p>
      <div className="stat-grid"><div className="stat-card"><small>Matched rolls / dice</small><strong>{totals.rolls} / {totals.dice}</strong></div><div className="stat-card"><small>Players / expressions</small><strong>{totals.players} / {totals.expressions}</strong></div><div className="stat-card"><small>Average percentile</small><strong>{average===null?'—':`${(average*100).toFixed(1)}%`}</strong></div><div className="stat-card"><small>Natural minimums / maximums</small><strong>{playersStats.reduce((sum,item)=>sum+item.mins,0)} / {playersStats.reduce((sum,item)=>sum+item.maxs,0)}</strong></div></div>
      <div className="mode-tabs"><button type="button" aria-pressed={mode==='results'} onClick={()=>setMode('results')}>Results</button><button type="button" aria-pressed={mode==='dice'} onClick={()=>setMode('dice')}>Dice</button></div>
      {mode==='dice'&&<label>Die type <select value={effectiveOutcomeDie??''} onChange={event=>setOutcomeDie(event.target.value)}>{dieTypes.map(type=><option key={type}>{type}</option>)}</select></label>}
      <div className="stat-scroll"><table><thead><tr><th>Outcome</th><th>Count</th><th>Observed %</th></tr></thead><tbody>{outcomes.rows.slice(0,100).map(item=><tr key={`${typeof item.value}:${item.value}`}><td>{item.value}</td><td>{item.count}</td><td>{outcomes.count?`${(item.count/outcomes.count*100).toFixed(1)}%`:'—'}</td></tr>)}</tbody></table></div>
      <div className="sequence-scroll"><table><thead><tr><th scope="col">#</th><th scope="col">Time</th><th scope="col">Expression</th>{analysis.players.map(item=><th scope="col" key={item.playerId}><PlayerName roomId={roomId} viewerId={viewerId} playerId={item.playerId} name={item.name}/></th>)}</tr></thead><tbody>{matched.slice(0,500).map((roll,index)=><tr key={roll.id}><td>{index+1}</td><td>{new Date(roll.timestamp).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</td><td><code>{roll.normalizedExpression.slice(roll.normalizedExpression.indexOf(':')+1)}</code></td>{analysis.players.map(item=><td key={item.playerId}>{item.playerId===roll.rollerId?display(roll.finalResult):''}</td>)}</tr>)}</tbody><tfoot><tr><th colSpan={3}>Matching rolls</th>{analysis.players.map(item=><td key={item.playerId}>{item.matching}</td>)}</tr><tr><th colSpan={3}>Expression-matched rolls</th>{analysis.players.map(item=><td key={item.playerId}>{item.eligible}</td>)}</tr><tr><th colSpan={3}>Match rate</th>{analysis.players.map(item=><td key={item.playerId}>{(item.rate*100).toFixed(1)}%</td>)}</tr><tr><th colSpan={3}>Mean shown result</th>{analysis.players.map(item=><td key={item.playerId}>{item.mean?.toFixed(2)??'—'}</td>)}</tr></tfoot></table></div>{matched.length>500&&<p>Showing first 500 matching rolls.</p>}
    </>}
  </section>;
}
