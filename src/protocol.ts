import { EXTENSION_ID } from './constants';
import type { Dialect } from './engine/ast';
import type { Value } from './engine/evaluate';
import type { DieDraw } from './engine/evaluate';
import type { Node } from './engine/ast';
export const REQUEST_CHANNEL = `${EXTENSION_ID}/roll-request/v1`;
export const RESULT_CHANNEL = `${EXTENSION_ID}/roll-result/v1`;
export const GM_CHANNEL = `${EXTENSION_ID}/gm-result/v1`;
export const GM_PUBLIC_KEY = `${EXTENSION_ID}/gm-public-key`;
export type Visibility = 'everyone' | 'self' | 'gm';
export interface RollRequest { version:1; requestId:string; expression:string; dialect?:Dialect; visibility?:Visibility; label?:string; source?:string }
export interface VerificationRecord { state:'verified'|'failed'; reason?:string; rollId:string; protocol:string; canonicalExpression:string; rollerConnectionId:string; peerConnectionId:string; commitments?:Record<string,string>; contributions?:Record<string,string>; finalSeed?:string }
export interface RollResult { version:1; requestId:string; expression:string; dialect:Dialect; visibility:Visibility; playerId:string; playerName:string; value:Value; interpretation?:string; trace:string[]; steps?:string[]; stepDice?:string[]; stepDrawIndices?:number[][]; resolution?:{ast:Node;dice:DieDraw[]}; time:number; label?:string; source?:string; error?:string; overridden?:boolean; verification?:VerificationRecord }
export const isRequest=(v:unknown):v is RollRequest=>typeof v==='object'&&v!==null&&(v as RollRequest).version===1&&typeof (v as RollRequest).requestId==='string'&&typeof (v as RollRequest).expression==='string';
export const isResult=(v:unknown):v is RollResult=>typeof v==='object'&&v!==null&&(v as RollResult).version===1&&typeof (v as RollResult).requestId==='string'&&typeof (v as RollResult).expression==='string';
export interface EncryptedResult { version:1; key:string; iv:string; ciphertext:string }
