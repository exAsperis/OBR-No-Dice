import type { DiceSession, StoredRoll } from './sessionLedger';

const chronological=(rolls:StoredRoll[])=>[...rolls].sort((a,b)=>a.timestamp-b.timestamp);
const csvField=(value:string)=>/[",\r\n]/.test(value)?`"${value.replaceAll('"','""')}"`:value;
const resultText=(value:StoredRoll['finalResult'])=>value!==null&&typeof value==='object'?JSON.stringify(value):String(value);

export function exportSessionCsv(_session:DiceSession,rolls:StoredRoll[]):string {
  const columns=['timestamp','player','playerId','expression','normalizedExpression','finalResult','interpretation','visibility','dice'];
  const lines=chronological(rolls).map(roll=>[
    new Date(roll.timestamp).toISOString(),roll.rollerName,roll.rollerId,roll.expression,
    roll.normalizedExpression,resultText(roll.finalResult),roll.result.interpretation??'',
    roll.visibility,JSON.stringify(roll.resolution.dice),
  ].map(csvField).join(','));
  return [columns.join(','),...lines].join('\r\n');
}

export function exportSessionJson(session:DiceSession,rolls:StoredRoll[]):string {
  return JSON.stringify({format:'no-dice-session',version:1,exportedAt:new Date().toISOString(),session,rolls:chronological(rolls)},null,2);
}

export function downloadText(filename:string,content:string,mimeType:string):void {
  const blob=new Blob([content],{type:mimeType});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.style.display='none';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
}
