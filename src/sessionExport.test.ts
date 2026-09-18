import { describe, expect, it } from 'vitest';
import { exportSessionCsv, exportSessionJson } from './sessionExport';
import type { DiceSession, StoredRoll } from './sessionLedger';
import { rollExpression } from './rollService';

const session:DiceSession={id:'s',name:'Example',startedAt:1000};
function record(timestamp:number):StoredRoll {const result=rollExpression({requestId:`r-${timestamp}`,expression:'2d6',visibility:'self',playerId:'p',playerName:'Player'},{integer:()=>0}).record;result.time=timestamp;return {id:result.requestId,sessionId:'s',timestamp,rollerId:'p',rollerName:'Player',expression:result.expression,normalizedExpression:'nodice:2d6',finalResult:result.value,resolution:result.resolution!,visibility:result.visibility,result};}

describe('session export',()=>{
  it('keeps the full roll objects in chronological JSON with an archival envelope',()=>{const later=record(3000),earlier=record(2000);const text=exportSessionJson(session,[later,earlier]);const archive=JSON.parse(text);expect(archive).toMatchObject({format:'no-dice-session',version:1,session});expect(archive.exportedAt).toMatch(/^\d{4}-\d\d-\d\dT/);expect(archive.rolls).toEqual([earlier,later]);expect(text).toContain('\n  "rolls"');});
  it('exports chronological CSV with escaped commas, quotes, newlines, arrays, dice and empty interpretation',()=>{const later=record(3000),earlier=record(2000);earlier.rollerName='A,"B"\nC';earlier.expression='2d6,"x"\r\nmore';earlier.finalResult=[1,2] as StoredRoll['finalResult'];earlier.result.interpretation=undefined;later.result.interpretation='Hit, "hard"';const csv=exportSessionCsv(session,[later,earlier]);const lines=csv.split('\r\n');expect(lines[0]).toBe('timestamp,player,playerId,expression,normalizedExpression,finalResult,interpretation,visibility,dice');expect(csv.indexOf(new Date(2000).toISOString())).toBeLessThan(csv.indexOf(new Date(3000).toISOString()));expect(csv).toContain('"A,""B""\nC"');expect(csv).toContain('"2d6,""x""\r\nmore"');expect(csv).toContain('"[1,2]"');expect(csv).toContain('"Hit, ""hard"""');expect(csv).toContain(',self,"[{');expect(csv).toContain('"[1,2]",,self,');});
  it('exports empty ledgers and leaves the input order unchanged',()=>{expect(exportSessionCsv(session,[])).toBe('timestamp,player,playerId,expression,normalizedExpression,finalResult,interpretation,visibility,dice');expect(JSON.parse(exportSessionJson(session,[])).rolls).toEqual([]);const a=record(3000),b=record(2000),rolls=[a,b];exportSessionCsv(session,rolls);expect(rolls).toEqual([a,b]);});
});
