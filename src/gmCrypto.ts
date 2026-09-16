import OBR from '@owlbear-rodeo/sdk';
import { GM_PUBLIC_KEY, type EncryptedResult, type RollResult } from './protocol';
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function publishGmKey():Promise<CryptoKey> {
  const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
  await OBR.room.setMetadata({[GM_PUBLIC_KEY]:jwk});
  return pair.privateKey;
}
export async function encryptForGm(result:RollResult):Promise<EncryptedResult> {
  const metadata=await OBR.room.getMetadata();
  const jwk=metadata[GM_PUBLIC_KEY];
  if(!jwk||typeof jwk!=='object')throw new Error('A GM must open No Dice before GM rolls can be sent.');
  const publicKey=await crypto.subtle.importKey('jwk',jwk as JsonWebKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const bytes=new TextEncoder().encode(JSON.stringify(result));
  if(bytes.length>8000)throw new Error('GM roll is too large to broadcast.');
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,bytes);
  const rawKey=await crypto.subtle.exportKey('raw',aes);
  const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},publicKey,rawKey);
  return {version:1,key:encode(new Uint8Array(wrapped)),iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext))};
}
export async function decryptForGm(payload:EncryptedResult,key:CryptoKey):Promise<RollResult> {
  const rawKey=await crypto.subtle.decrypt({name:'RSA-OAEP'},key,decode(payload.key));
  const aes=await crypto.subtle.importKey('raw',rawKey,{name:'AES-GCM'},false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(payload.iv)},aes,decode(payload.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain)) as RollResult;
}
