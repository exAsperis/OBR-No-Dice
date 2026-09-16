import { EXTENSION_ID } from './constants';
import type { RollResult } from './protocol';
const key=(room:string,player:string)=>`${EXTENSION_ID}/history/${room}/${player}`;
export function loadHistory(room:string,player:string):RollResult[] { try { const value=JSON.parse(localStorage.getItem(key(room,player))??'[]'); return Array.isArray(value)?value.slice(-100):[]; } catch { return []; } }
export function saveHistory(room:string,player:string,history:RollResult[]) { try { localStorage.setItem(key(room,player),JSON.stringify(history.slice(-100))); } catch { /* storage may be unavailable */ } }
export function appendHistory(room:string,player:string,result:RollResult):RollResult[] {
  const history=loadHistory(room,player);
  if(history.some(item=>item.requestId===result.requestId))return history;
  const next=[...history,result].slice(-100);
  saveHistory(room,player,next);
  return next;
}
