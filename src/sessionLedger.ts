import { EXTENSION_ID } from './constants';
import { formatShort } from './engine/format';
import { parse } from './engine/parser';
import { splitExpressionName } from './expressionName';
import { interpretationPipe } from './engine/parser';
import type { DieDraw } from './engine/evaluate';
import type { RollResult } from './protocol';

export interface DiceSession { id:string; name:string; startedAt:number; endedAt?:number; kind?:'override'; suspendedSession?:DiceSession }
export interface StoredRoll { id:string; sessionId:string; timestamp:number; rollerId:string; rollerName:string; expression:string; normalizedExpression:string; finalResult:RollResult['value']; resolution:NonNullable<RollResult['resolution']>; visibility:RollResult['visibility']; result:RollResult }
export const SESSION_KEY=`${EXTENSION_ID}/current-session`;
export const LEDGER_CHANNEL=`${EXTENSION_ID}/ledger-updated`;
const DB_NAME=`${EXTENSION_ID}/ledger`;
const LIMIT=10_000;
const scope=(room:string,player:string)=>`${room}/${player}`;
const legacyKey=(room:string,player:string)=>`${EXTENSION_ID}/history/${room}/${player}`;
export const defaultSessionName=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
export const localDateTime=(date=new Date(),precise=false)=>`${defaultSessionName(date).replace(' ','T')}${precise?`:${String(date.getSeconds()).padStart(2,'0')}.${String(date.getMilliseconds()).padStart(3,'0')}`:''}`;
export function parseLocalDateTime(value:string):number {const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);if(!match)return NaN;const [,y,m,d,h,min,s='0',ms='0']=match;const date=new Date(Number(y),Number(m)-1,Number(d),Number(h),Number(min),Number(s),Number(ms.padEnd(3,'0')));return date.getFullYear()===Number(y)&&date.getMonth()===Number(m)-1&&date.getDate()===Number(d)&&date.getHours()===Number(h)&&date.getMinutes()===Number(min)&&date.getSeconds()===Number(s)?date.getTime():NaN;}
export const makeSession=(name=defaultSessionName(),startedAt=Date.now()):DiceSession=>({id:crypto.randomUUID(),name,startedAt});
export function readSharedSession(metadata:Record<string,unknown>):DiceSession|undefined {const raw=metadata[SESSION_KEY] as Partial<DiceSession>|undefined;return raw&&typeof raw.id==='string'&&typeof raw.name==='string'&&Number.isFinite(raw.startedAt)?{id:raw.id,name:raw.name,startedAt:raw.startedAt!,...(Number.isFinite(raw.endedAt)?{endedAt:raw.endedAt}:{}),...(raw.kind==='override'?{kind:'override' as const}:{})}:undefined;}
export function normalizeExpression(result:RollResult):string {try{const ast=parse(result.expression,result.dialect);return `${result.dialect}:${formatShort(ast.kind==='interpret'?ast.expression:ast)}`;}catch{const named=splitExpressionName(result.expression).expression;const pipe=interpretationPipe(named);return `${result.dialect}:${(pipe<0?named:named.slice(0,pipe)).trim()}`;}}
const request=<T>(value:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error);});
let dbPromise:Promise<IDBDatabase>|undefined;
function db():Promise<IDBDatabase>{return dbPromise??=new Promise((resolve,reject)=>{const opening=indexedDB.open(DB_NAME,2);opening.onupgradeneeded=event=>{const database=opening.result;if(event.oldVersion<1){database.createObjectStore('sessions',{keyPath:'key'}).createIndex('scope','scope');const rolls=database.createObjectStore('rolls',{keyPath:'key'});rolls.createIndex('scope','scope');rolls.createIndex('session','sessionKey');rolls.createIndex('time','timeKey');}if(event.oldVersion===1){const cursor=opening.transaction!.objectStore('rolls').openCursor();cursor.onsuccess=()=>{const entry=cursor.result;if(!entry)return;const row=entry.value as RollRow;row.roll.normalizedExpression=normalizeExpression(row.roll.result);entry.update(row);entry.continue();};}};opening.onsuccess=()=>resolve(opening.result);opening.onerror=()=>reject(opening.error);});}
type SessionRow={key:string;scope:string;session:DiceSession};
type RollRow={key:string;scope:string;sessionKey:string;timeKey:string;roll:StoredRoll};
async function rows<T>(store:'sessions'|'rolls',index:'scope'|'session',value:string):Promise<T[]>{const database=await db();return request<T[]>(database.transaction(store).objectStore(store).index(index).getAll(value));}
async function put(store:'sessions'|'rolls',value:SessionRow|RollRow):Promise<void>{const database=await db();await request(database.transaction(store,'readwrite').objectStore(store).put(value));}
async function remove(store:'sessions'|'rolls',key:string):Promise<void>{const database=await db();await request(database.transaction(store,'readwrite').objectStore(store).delete(key));}
export async function listSessions(room:string,player:string):Promise<DiceSession[]>{return (await rows<SessionRow>('sessions','scope',scope(room,player))).map(row=>row.session).filter(session=>session.id!=='migration').sort((a,b)=>b.startedAt-a.startedAt);}
export async function ensureSession(room:string,player:string,shared?:DiceSession):Promise<DiceSession>{const existing=await listSessions(room,player);const current=existing.find(s=>!s.endedAt);if(shared){if(current?.id!==shared.id){if(current)await splitSession(room,player,current,shared);else await put('sessions',{key:`${scope(room,player)}/${shared.id}`,scope:scope(room,player),session:shared});}else if(current.name!==shared.name)await put('sessions',{key:`${scope(room,player)}/${shared.id}`,scope:scope(room,player),session:shared});return shared;}if(current)return current;const created=makeSession();await put('sessions',{key:`${scope(room,player)}/${created.id}`,scope:scope(room,player),session:created});return created;}
const sessionKey=(room:string,player:string,id:string)=>`${scope(room,player)}/${id}`;
const txDone=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Session update failed'));tx.onerror=()=>reject(tx.error??new Error('Session update failed'));});

/** Suspend the real session without moving any roll into the disposable session. */
export async function enterOverrideSession(room:string,player:string,previous:DiceSession,override:DiceSession):Promise<DiceSession>{
  if(override.kind!=='override'||override.id===previous.id||override.name!=='OVERRIDE')throw new Error('Expected a distinct override session');
  const tx=(await db()).transaction('sessions','readwrite'),store=tx.objectStore('sessions'),done=txDone(tx);
  const prior=await request<SessionRow|undefined>(store.get(sessionKey(room,player,previous.id)));
  const existing=await request<SessionRow|undefined>(store.get(sessionKey(room,player,override.id)));
  if(!existing){
    const all=await request<SessionRow[]>(store.index('scope').getAll(scope(room,player)));
    for(const row of all)if(row.session.id!==previous.id&&row.session.id!=='migration'&&!row.session.endedAt&&row.session.kind!=='override')
      store.put({...row,session:{...row.session,endedAt:override.startedAt}});
    const original=prior?.session??previous;
    store.put({key:sessionKey(room,player,previous.id),scope:scope(room,player),session:{...original,endedAt:override.startedAt}});
    store.put({key:sessionKey(room,player,override.id),scope:scope(room,player),session:{...override,suspendedSession:original}});
  }
  await done;
  return override;
}

/** Remove all local override sessions and their rolls, including stale ones after an offline reconnect. */
export async function purgeOverrideSessions(room:string,player:string):Promise<void>{
  const localScope=scope(room,player),tx=(await db()).transaction(['sessions','rolls'],'readwrite'),sessions=tx.objectStore('sessions'),rolls=tx.objectStore('rolls'),done=txDone(tx);
  const all=await request<SessionRow[]>(sessions.index('scope').getAll(localScope));
  const disposable=all.filter(row=>row.session.kind==='override'||row.session.id.startsWith('override-'));
  for(const row of disposable){
    const belonging=await request<RollRow[]>(rolls.index('session').getAll(row.key));
    for(const item of belonging)rolls.delete(item.key);
    sessions.delete(row.key);
    const previous=row.session.suspendedSession;
    if(previous)sessions.put({key:sessionKey(room,player,previous.id),scope:localScope,session:previous});
  }
  await done;
  if(disposable.length)try{const channel=new BroadcastChannel(LEDGER_CHANNEL);channel.postMessage({roomId:room,playerId:player});channel.close();}catch{/* Other windows refresh on metadata. */}
}

export async function synchronizeRoomSession(room:string,player:string,shared?:DiceSession,previous?:DiceSession):Promise<DiceSession>{
  if(shared?.kind==='override'){
    if(!previous)throw new Error('Override session is missing its previous session');
    if((await listSessions(room,player)).some(session=>session.kind==='override'&&session.id!==shared.id))await purgeOverrideSessions(room,player);
    return enterOverrideSession(room,player,previous,shared);
  }
  await purgeOverrideSessions(room,player);
  return ensureSession(room,player,shared);
}
export interface MigrationPreview {count:number;rollers:number;first?:number;last?:number}
export function migrationPreview(rolls:StoredRoll[],start:number):MigrationPreview {const moved=rolls.filter(roll=>roll.timestamp>=start).sort((a,b)=>a.timestamp-b.timestamp);return {count:moved.length,rollers:new Set(moved.map(roll=>roll.rollerId)).size,first:moved[0]?.timestamp,last:moved.at(-1)?.timestamp};}
export async function splitSession(room:string,player:string,current:DiceSession,next:DiceSession,expectedMoved?:number):Promise<void>{
  if(!Number.isFinite(next.startedAt))throw new Error('Enter a valid Session Start time.');
  const localScope=scope(room,player),database=await db();
  const tx=database.transaction(['sessions','rolls'],'readwrite');
  const sessions=tx.objectStore('sessions'),rolls=tx.objectStore('rolls');
  const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Session migration failed'));tx.onerror=()=>reject(tx.error??new Error('Session migration failed'));});
  try{
    const rows=await request<RollRow[]>(rolls.index('session').getAll(`${localScope}/${current.id}`));
    const remaining=rows.filter(row=>row.roll.timestamp<next.startedAt);
    if(expectedMoved!==undefined&&rows.length-remaining.length!==expectedMoved)throw new Error('Rolls changed while the preview was open. Review the updated preview and try again.');
    const latest=remaining.length?Math.max(...remaining.map(row=>row.roll.timestamp)):current.startedAt;
    const endedAt=remaining.length===rows.length?next.startedAt:Math.max(current.startedAt,Math.min(next.startedAt,latest));
    sessions.put({key:`${localScope}/${current.id}`,scope:localScope,session:{...current,endedAt}});
    sessions.put({key:`${localScope}/${next.id}`,scope:localScope,session:next});
    for(const row of rows)if(row.roll.timestamp>=next.startedAt)rolls.put({...row,sessionKey:`${localScope}/${next.id}`,roll:{...row.roll,sessionId:next.id}});
  }catch(error){tx.abort();await done.catch(()=>{});throw error;}
  await done;
  try{const channel=new BroadcastChannel(LEDGER_CHANNEL);channel.postMessage({roomId:room,playerId:player});channel.close();}catch{/* Another window will refresh on metadata change. */}
}
export async function startSession(room:string,player:string,name:string,startedAt=Date.now()+1,expectedMoved?:number):Promise<DiceSession>{const current=await ensureSession(room,player);if(startedAt<current.startedAt)throw new Error('Session Start cannot be earlier than the beginning of the current session.');const next=makeSession(name.trim()||defaultSessionName(),startedAt);await splitSession(room,player,current,next,expectedMoved);return next;}
export async function rollbackSessionSplit(room:string,player:string,previous:DiceSession,created:DiceSession):Promise<void>{
  const localScope=scope(room,player),database=await db(),tx=database.transaction(['sessions','rolls'],'readwrite');
  const sessions=tx.objectStore('sessions'),rolls=tx.objectStore('rolls');
  const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Could not restore the previous session'));tx.onerror=()=>reject(tx.error??new Error('Could not restore the previous session'));});
  const moved=await request<RollRow[]>(rolls.index('session').getAll(`${localScope}/${created.id}`));
  for(const row of moved)rolls.put({...row,sessionKey:`${localScope}/${previous.id}`,roll:{...row.roll,sessionId:previous.id}});
  sessions.put({key:`${localScope}/${previous.id}`,scope:localScope,session:previous});
  sessions.delete(`${localScope}/${created.id}`);
  await done;
  try{const channel=new BroadcastChannel(LEDGER_CHANNEL);channel.postMessage({roomId:room,playerId:player});channel.close();}catch{/* Other windows refresh on metadata. */}
}
export async function renameSession(room:string,player:string,name:string):Promise<DiceSession>{const current=await ensureSession(room,player);const next={...current,name:name.trim()||current.name};await put('sessions',{key:`${scope(room,player)}/${next.id}`,scope:scope(room,player),session:next});return next;}
function stored(result:RollResult,sessionId:string):StoredRoll {const normalizedExpression=normalizeExpression(result);let resolution=result.resolution; if(!resolution){try{resolution={ast:parse(result.expression,result.dialect),dice:legacyDice(result)};}catch{resolution={ast:{kind:'literal',value:0,span:{start:0,end:0}},dice:[]};}}return {id:result.requestId,sessionId,timestamp:result.time,rollerId:result.playerId,rollerName:result.playerName,expression:result.expression,normalizedExpression,finalResult:result.value,resolution,visibility:result.visibility,result};}
function legacyDice(result:RollResult):DieDraw[]{const draws:DieDraw[]=[];let dieIndex=0;for(const line of result.trace){const initial=/^die (\d+) → (-?\d+(?:\.\d+)?)$/.exec(line);if(initial){dieIndex=Number(initial[1])-1;draws.push({die:'legacy',dieIndex,face:Number(initial[2]),kind:'initial'});continue;}const additional=/^(reroll|explode) → (-?\d+(?:\.\d+)?)$/.exec(line);if(additional)draws.push({die:'legacy',dieIndex,face:Number(additional[2]),kind:additional[1]==='reroll'?'reroll':'explosion'});}return draws;}
async function insert(room:string,player:string,result:RollResult,sessionId:string):Promise<void>{const localScope=scope(room,player),roll=stored(result,sessionId);await put('rolls',{key:`${localScope}/${roll.id}`,scope:localScope,sessionKey:`${localScope}/${sessionId}`,timeKey:`${localScope}/${String(roll.timestamp).padStart(16,'0')}/${roll.id}`,roll});}
export async function appendRoll(room:string,player:string,result:RollResult,shared?:DiceSession,previous?:DiceSession):Promise<void>{if(result.error||Boolean(result.overridden)!==(shared?.kind==='override'))return;const localScope=scope(room,player);const database=await db();if(await request(database.transaction('rolls').objectStore('rolls').get(`${localScope}/${result.requestId}`)))return;const session=await synchronizeRoomSession(room,player,shared,previous);await insert(room,player,result,session.id);if(session.kind==='override')await pruneOverrideRolls(room,player,session.id);else await prune(room,player);}
export async function getSessionRolls(room:string,player:string,sessionId:string):Promise<StoredRoll[]>{return (await rows<RollRow>('rolls','session',`${scope(room,player)}/${sessionId}`)).map(row=>row.roll).sort((a,b)=>a.timestamp-b.timestamp);}
export async function getRecentRolls(room:string,player:string,limit=100):Promise<RollResult[]>{const all=(await rows<RollRow>('rolls','scope',scope(room,player))).map(row=>row.roll).sort((a,b)=>a.timestamp-b.timestamp);return all.slice(-limit).map(roll=>roll.result);}
export async function migrateHistory(room:string,player:string,shared?:DiceSession):Promise<void>{const marker=`${scope(room,player)}/migration`;const database=await db();if(await request(database.transaction('sessions').objectStore('sessions').get(marker)))return;const old=(()=>{try{const parsed=JSON.parse(localStorage.getItem(legacyKey(room,player))??'[]');return Array.isArray(parsed)?parsed.filter((x):x is RollResult=>x&&typeof x.requestId==='string'&&typeof x.expression==='string'):[];}catch{return [] as RollResult[];}})();if(old.length){const session:DiceSession={id:`previous-${player}`,name:'Previous Rolls',startedAt:Math.min(...old.map(x=>x.time||Date.now())),endedAt:Date.now()};await put('sessions',{key:`${scope(room,player)}/${session.id}`,scope:scope(room,player),session});for(const result of old)await insert(room,player,result,session.id);}await put('sessions',{key:marker,scope:scope(room,player),session:{id:'migration',name:'',startedAt:0,endedAt:0}});await ensureSession(room,player,shared);}
export async function prune(room:string,player:string,limit=LIMIT):Promise<void>{const all=(await rows<RollRow>('rolls','scope',scope(room,player))).sort((a,b)=>a.roll.timestamp-b.roll.timestamp);if(all.length<=limit)return;const sessions=await listSessions(room,player);const current=sessions.find(x=>!x.endedAt)?.id;let excess=all.length-limit;for(const session of [...sessions].reverse()){if(session.id===current)continue;const group=all.filter(row=>row.roll.sessionId===session.id);if(!group.length)continue;if(group.length<=excess){for(const row of group)await remove('rolls',row.key);excess-=group.length;if(excess<=0)return;}}for(const row of all){if(excess<=0)break;if(row.roll.sessionId===current&&sessions.some(s=>s.id!==current&&all.some(x=>x.roll.sessionId===s.id)))continue;await remove('rolls',row.key);excess--;}}
async function pruneOverrideRolls(room:string,player:string,overrideId:string,limit=LIMIT):Promise<void>{
  const all=await rows<RollRow>('rolls','scope',scope(room,player));
  let excess=all.length-limit;
  if(excess<=0)return;
  const disposable=all.filter(row=>row.roll.sessionId===overrideId).sort((a,b)=>a.roll.timestamp-b.roll.timestamp);
  for(const row of disposable){if(excess--<=0)break;await remove('rolls',row.key);}
}
