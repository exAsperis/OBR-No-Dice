import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { EXTENSION_ID } from './constants';
import { rollExpression } from './rollService';

it('upgrades previously stored canonical keys without changing original roll data',async()=>{
  const source='2d6+1 | <=6:Miss; >=7:Hit # Strike';
  const result=rollExpression({requestId:'existing-roll',expression:source,visibility:'self',playerId:'player',playerName:'Player'},{integer:()=>0}).record;
  const name=`${EXTENSION_ID}/ledger`;
  const old=await new Promise<IDBDatabase>((resolve,reject)=>{const opening=indexedDB.open(name,1);opening.onupgradeneeded=()=>{const database=opening.result;database.createObjectStore('sessions',{keyPath:'key'}).createIndex('scope','scope');const rolls=database.createObjectStore('rolls',{keyPath:'key'});rolls.createIndex('scope','scope');rolls.createIndex('session','sessionKey');rolls.createIndex('time','timeKey');};opening.onsuccess=()=>resolve(opening.result);opening.onerror=()=>reject(opening.error);});
  await new Promise<void>((resolve,reject)=>{const tx=old.transaction('rolls','readwrite');tx.objectStore('rolls').put({key:'room/player/existing-roll',scope:'room/player',sessionKey:'room/player/old-session',timeKey:'room/player/0000000000001000/existing-roll',roll:{id:'existing-roll',sessionId:'old-session',timestamp:1000,rollerId:'player',rollerName:'Player',expression:source,normalizedExpression:'nodice:2d6+1 | <=6:Miss; >=7:Hit',finalResult:result.value,resolution:result.resolution,visibility:'self',result}});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
  old.close();
  const {getSessionRolls}=await import('./sessionLedger');
  const [upgraded]=await getSessionRolls('room','player','old-session');
  expect(upgraded.normalizedExpression).toBe('nodice:2d6+1');
  expect(upgraded.expression).toBe(source);
  expect(upgraded.finalResult).toBe(result.value);
  expect(upgraded.result.interpretation).toBe(result.interpretation);
});
