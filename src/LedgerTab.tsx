import { useMemo, useState } from 'react';
import type { DiceSession, StoredRoll } from './sessionLedger';
import { downloadText, exportSessionCsv, exportSessionJson } from './sessionExport';
import { buildQueryAnalysis, type ResultComparison } from './sequenceStats';
import { dieType } from './analytics';
import { QUERY_PRESETS, type QueryPreset } from './queryPresets';
import { PlayerName } from './components/PlayerName';

const display=(value:StoredRoll['finalResult'])=>Array.isArray(value)?`[${value.join(', ')}]`:String(value);
const operators:ResultComparison[]=['any','=','<=','>='];
const operatorLabel=(operator:ResultComparison)=>operator==='any'?'Any':operator==='>='?'≥':operator==='<='?'≤':'=';

export function LedgerTab({rolls,session,roomId='',viewerId=''}:{rolls:StoredRoll[];session?:DiceSession;roomId?:string;viewerId?:string}){
  const chronologicalRolls=useMemo(()=>[...rolls].sort((a,b)=>a.timestamp-b.timestamp),[rolls]);
  const available=useMemo(()=>[...new Map(chronologicalRolls.map(roll=>[roll.rollerId,roll.rollerName])).entries()].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name)),[chronologicalRolls]);
  const allDieTypes=useMemo(()=>[...new Set(chronologicalRolls.flatMap(roll=>roll.resolution.dice.map(draw=>dieType(roll,draw))))].sort(),[chronologicalRolls]);
  const categories=useMemo(()=>[...new Set(chronologicalRolls.map(roll=>roll.result.interpretation).filter((value):value is string=>Boolean(value)))].sort(),[chronologicalRolls]);
  const [chosen,setChosen]=useState<string[]|null>(null);
  const [pattern,setPattern]=useState('');
  const [resultComparison,setResultComparison]=useState<ResultComparison>('any');
  const [resultValue,setResultValue]=useState('6');
  const [rollComparison,setRollComparison]=useState<ResultComparison>('any');
  const [rollValue,setRollValue]=useState('20');
  const [rollDie,setRollDie]=useState('');
  const [category,setCategory]=useState('');
  const [from,setFrom]=useState('');
  const [until,setUntil]=useState('');
  const selected=chosen??available.map(item=>item.id);
  const resultNumber=Number(resultValue),rollNumber=Number(rollValue);
  const validResult=resultComparison==='any'||(resultValue.trim()!==''&&Number.isFinite(resultNumber));
  const validRoll=rollComparison==='any'||(rollValue.trim()!==''&&Number.isFinite(rollNumber));
  const analysis=useMemo(()=>validResult&&validRoll?buildQueryAnalysis(chronologicalRolls,{pattern,selectedPlayers:selected,result:{comparison:resultComparison,value:resultNumber},roll:{comparison:rollComparison,value:rollNumber,dieType:rollDie||undefined},category,from:from?new Date(from).getTime():undefined,until:until?new Date(until).getTime()+60_000:undefined}):{entries:[],players:[],eligible:0,matching:0,error:'Enter a numeric filter value.'},[chronologicalRolls,pattern,chosen,resultComparison,resultNumber,rollComparison,rollNumber,rollDie,category,from,until,validResult,validRoll]);
  const matched=useMemo(()=>analysis.entries.map(entry=>entry.roll),[analysis]);
  const visibleEntries=analysis.entries.slice(0,500);
  const filenameBase=`no-dice-${(session?.name??'session').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').replace(/-(\d{2})-(\d{2})$/,'-$1$2')||'session'}`;
  const exportRolls=(kind:'filtered'|'session-csv'|'session-json')=>{
    if(!session)return;
    if(kind==='filtered')downloadText(`${filenameBase}-filtered-ledger.csv`,exportSessionCsv(session,matched),'text/csv;charset=utf-8');
    else if(kind==='session-csv')downloadText(`${filenameBase}-session.csv`,exportSessionCsv(session,rolls),'text/csv;charset=utf-8');
    else downloadText(`${filenameBase}-session.json`,exportSessionJson(session,rolls),'application/json;charset=utf-8');
  };
  const selectedSet=new Set(selected);
  const toggle=(id:string)=>setChosen(previous=>{const current=new Set(previous??available.map(item=>item.id));if(current.has(id))current.delete(id);else current.add(id);return [...current];});
  const applyPreset=(preset:QueryPreset)=>{
    setPattern(preset.pattern);
    setResultComparison(preset.result?.comparison??'any');
    setResultValue(String(preset.result?.value??6));
    setRollComparison(preset.roll?.comparison??'any');
    setRollValue(String(preset.roll?.value??20));
    setRollDie(preset.roll?.dieType??'');
    setChosen(null);setCategory('');setFrom('');setUntil('');
  };
  return <section className="sequence-tab" aria-label="Ledger">
    <details className="ledger-export"><summary>Export</summary><div><button type="button" disabled={!session||matched.length===0} onClick={()=>exportRolls('filtered')}>CSV · Filtered Ledger</button><button type="button" disabled={!session} onClick={()=>exportRolls('session-csv')}>CSV · Entire Session</button><button type="button" disabled={!session} onClick={()=>exportRolls('session-json')}>JSON · Entire Session</button></div></details>
    <p className="sequence-help">Result checks the final expression value. Roll checks any individual die draw in the record, including rerolls and explosions.</p>
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
      <p className="filter-summary">{analysis.matching>500?`${analysis.matching} of ${rolls.length} rolls match. Showing first 500.`:`${analysis.matching} of ${rolls.length} rolls shown.`}</p>
      <div className="sequence-scroll"><table className="ledger-table"><thead><tr>{['#','Time','Player','Expression','Result','Interpretation'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visibleEntries.map(entry=>{const roll=entry.roll;return <tr key={roll.id}><td>{entry.order}</td><td><time title={new Date(roll.timestamp).toLocaleString()}>{new Date(roll.timestamp).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})}</time></td><td><PlayerName roomId={roomId} viewerId={viewerId} playerId={roll.rollerId} name={roll.rollerName}/></td><td><code>{roll.normalizedExpression.slice(roll.normalizedExpression.indexOf(':')+1)}</code></td><td>{display(roll.finalResult)}</td><td className="ledger-interpretation">{roll.result.interpretation||'—'}</td></tr>;})}</tbody></table></div>
    </>}
  </section>;
}
