import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { EXTENSION_ID } from './constants';
import { rollExpression } from './rollService';
import { analyzeSession, queryOutcomes } from './sessionStats';
import { buildSequenceAnalysis } from './sequenceStats';
import { appendRoll, defaultSessionName, ensureSession, getRecentRolls, getSessionRolls, listSessions, localDateTime, migrationPreview, migrateHistory, normalizeExpression, parseLocalDateTime, prune, renameSession, rollbackSessionSplit, startSession } from './sessionLedger';
import type { RollResult } from './protocol';

let sequence=0;
const identity=()=>({room:`room-${++sequence}`,player:'local-player'});
function makeRoll(expression:string,playerId='joe',faces:number[]=[0],visibility:RollResult['visibility']='everyone'){
  let position=0;
  return rollExpression({requestId:crypto.randomUUID(),expression,visibility,playerId,playerName:playerId}, {integer:max=>(faces[position++]??0)%max}).record;
}
describe('session ledger',()=>{
  it('splits only the active session at an inclusive boundary and preserves roll contents',async()=>{
    const {room,player}=identity();const old=await ensureSession(room,player);const base=old.startedAt+1000;
    const earlier=makeRoll('d6');earlier.time=base-1;await appendRoll(room,player,earlier);
    const historical=await startSession(room,player,'Historical',base);
    const times=[base+5999,base+6000,base+10000,base+15000];
    const source=times.map((time,i)=>{const roll=makeRoll('d20',i%2?'A':'B');roll.time=time;return roll;});
    for(const roll of source)await appendRoll(room,player,roll);
    const before=await getSessionRolls(room,player,historical.id);
    const boundary=times[1];expect(migrationPreview(before,boundary)).toEqual({count:3,rollers:2,first:boundary,last:times[3]});
    await expect(startSession(room,player,'Stale preview',boundary,2)).rejects.toThrow('preview');
    expect(await getSessionRolls(room,player,historical.id)).toHaveLength(4);
    const next=await startSession(room,player,'Next',boundary);
    expect(next.startedAt).toBe(boundary);
    expect((await getSessionRolls(room,player,historical.id)).map(x=>x.timestamp)).toEqual([times[0]]);
    expect((await getSessionRolls(room,player,next.id)).map(x=>x.timestamp)).toEqual(times.slice(1));
    expect(analyzeSession(await getSessionRolls(room,player,historical.id)).totalRolls).toBe(1);
    expect(analyzeSession(await getSessionRolls(room,player,next.id)).totalRolls).toBe(3);
    expect((await getSessionRolls(room,player,old.id)).map(x=>x.id)).toEqual([earlier.requestId]);
    for(const moved of await getSessionRolls(room,player,next.id)){const original=before.find(x=>x.id===moved.id)!;expect({...moved,sessionId:original.sessionId}).toEqual(original);}
    expect((await ensureSession(room,player)).id).toBe(next.id);
    await expect(startSession(room,player,'Invalid',old.startedAt)).rejects.toThrow('earlier');
    expect((await ensureSession(room,player)).id).toBe(next.id);
  });
  it('round trips local date/time without locale parsing',()=>{const date=new Date(2026,8,18,19,4);expect(localDateTime(date)).toBe('2026-09-18T19:04');expect(parseLocalDateTime(localDateTime(date))).toBe(date.getTime());const precise=new Date(2026,8,18,19,4,3,456);expect(parseLocalDateTime(localDateTime(precise,true))).toBe(precise.getTime());expect(Number.isNaN(parseLocalDateTime('2026-02-30T19:04'))).toBe(true);});
  it('restores the previous session and roll assignments when a room update fails',async()=>{const {room,player}=identity();const previous=await ensureSession(room,player);const roll=makeRoll('d6');roll.time=previous.startedAt+1000;await appendRoll(room,player,roll);const created=await startSession(room,player,'Temporary',roll.time);await rollbackSessionSplit(room,player,previous,created);expect((await ensureSession(room,player)).id).toBe(previous.id);expect((await getSessionRolls(room,player,previous.id)).map(item=>item.id)).toEqual([roll.requestId]);expect(await getSessionRolls(room,player,created.id)).toEqual([]);});
  it('creates, renames and advances a current session without moving old rolls',async()=>{
    const {room,player}=identity();const first=await ensureSession(room,player);expect(first.name).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);const date=new Date(2026,8,17,20,21);expect(defaultSessionName(date)).toBe('2026-09-17 20:21');
    await appendRoll(room,player,makeRoll('2d6+1'));const next=await startSession(room,player,'Second');await appendRoll(room,player,makeRoll('d20'));
    expect((await getSessionRolls(room,player,first.id))).toHaveLength(1);expect((await getSessionRolls(room,player,next.id))).toHaveLength(1);expect((await listSessions(room,player)).find(s=>s.id===first.id)?.endedAt).toBeDefined();
    await renameSession(room,player,'Renamed');expect((await ensureSession(room,player)).name).toBe('Renamed');expect((await getRecentRolls(room,player))).toHaveLength(2);
  });
  it('isolates each local player and migrates existing history once',async()=>{
    const {room,player}=identity();const old=makeRoll('d6','joe',[2],'self');localStorage.setItem(`${EXTENSION_ID}/history/${room}/${player}`,JSON.stringify([old]));await migrateHistory(room,player);await migrateHistory(room,player);const sessions=await listSessions(room,player);const previous=sessions.find(s=>s.name==='Previous Rolls')!;expect((await getSessionRolls(room,player,previous.id))).toHaveLength(1);expect((await getRecentRolls(room,player))).toHaveLength(1);expect((await getRecentRolls(room,'other-player'))).toHaveLength(0);expect((await ensureSession(room,player)).id).toBe(sessions.find(s=>!s.endedAt)!.id);
  });
  it('normalizes expressions and counts events, dice, players, filters and queries',async()=>{
    const {room,player}=identity();const session=await ensureSession(room,player);
    const rolls=[makeRoll('2d6 + 1','joe',[0,5]),makeRoll('2d6+1','bill',[2,3]),makeRoll('d20','bill',[19]),makeRoll('d6!','joe',[5,1]),makeRoll('d6ro=1','joe',[0,4])];
    for(const roll of rolls)await appendRoll(room,player,roll);
    const records=await getSessionRolls(room,player,session.id);expect(records).toHaveLength(5);expect(normalizeExpression(rolls[0])).toBe(normalizeExpression(rolls[1]));expect(normalizeExpression(rolls[2])).not.toBe(normalizeExpression(rolls[0]));
    const all=analyzeSession(records);expect([all.totalRolls,all.totalDice,all.distinctRollers,all.distinctExpressions]).toEqual([5,9,2,4]);expect(all.players.map(x=>x.rolls)).toEqual([3,2]);expect(all.expressions[0].rolls).toBe(2);
    const filtered=analyzeSession(records,'bill',normalizeExpression(rolls[0]),'results');expect(filtered.filteredRolls).toBe(1);expect(filtered.distribution).toEqual([{value:8,count:1}]);expect(queryOutcomes(filtered.distribution,'=',8)).toBe(1);expect(queryOutcomes(filtered.distribution,'<=',6)).toBe(0);expect(queryOutcomes(filtered.distribution,'>=',8)).toBe(1);
    const dice=analyzeSession(records,'joe',normalizeExpression(rolls[0]),'dice');expect(dice.distribution).toEqual([{value:1,count:1},{value:6,count:1}]);expect(records.find(x=>x.id===rolls[3].requestId)?.resolution.dice.map(x=>x.kind)).toEqual(['initial','explosion']);expect(records.find(x=>x.id===rolls[4].requestId)?.resolution.dice.map(x=>x.kind)).toEqual(['initial','reroll']);
  });
  it('prunes oldest eligible rolls and retains current history',async()=>{
    const {room,player}=identity();const old=await ensureSession(room,player);for(let i=0;i<3;i++)await appendRoll(room,player,makeRoll('d6'));const current=await startSession(room,player,'Now');for(let i=0;i<2;i++)await appendRoll(room,player,makeRoll('d6'));await prune(room,player,2);expect((await getSessionRolls(room,player,old.id))).toHaveLength(0);expect((await getSessionRolls(room,player,current.id))).toHaveLength(2);
  });
  it('groups named and interpreted rolls by their underlying expression',async()=>{
    const plain=makeRoll('2d6 + 1');
    const named=makeRoll('2d6+1 # Attack');
    const interpreted=makeRoll('2d6+1 | <=6:Miss; >=7:Hit # Strike');
    const different=makeRoll('2d6+2 | <=6:Miss');
    expect(normalizeExpression(named)).toBe(normalizeExpression(plain));
    expect(normalizeExpression(interpreted)).toBe(normalizeExpression(plain));
    expect(normalizeExpression(different)).not.toBe(normalizeExpression(plain));
  });
  it('builds a chronological player sequence from regex and final-result comparisons',async()=>{
    const {room,player}=identity();const session=await ensureSession(room,player);
    const source=[makeRoll('2d6','joe',[0,2]),makeRoll('2d6+1 # attack','bill',[2,3]),makeRoll('d20','joe',[0]),makeRoll('2d6-1 | <=6:Miss; >=7:Hit','joe',[1,1]),makeRoll('2d6','bill',[5,5])];
    for(let i=0;i<source.length;i++){source[i].time=1000+i;await appendRoll(room,player,source[i]);}
    const rolls=await getSessionRolls(room,player,session.id);
    const pattern='^2d6(?:[+-]\\d+)?$';
    const low=buildSequenceAnalysis(rolls,pattern,['joe','bill'],'<=',6);
    expect(low.error).toBeUndefined();expect([low.eligible,low.matching]).toEqual([4,2]);expect(low.entries.map(item=>item.roll.id)).toEqual([source[0].requestId,source[3].requestId]);expect(low.players.map(item=>[item.playerId,item.eligible,item.matching])).toEqual([['joe',2,2],['bill',2,0]]);
    const bill=buildSequenceAnalysis(rolls,pattern,['bill'],'>=',7);expect([bill.eligible,bill.matching]).toEqual([2,2]);expect(bill.players[0].rate).toBe(1);
    expect(buildSequenceAnalysis(rolls,'[',['joe'],'any',0).error).toBeTruthy();
  });
});
