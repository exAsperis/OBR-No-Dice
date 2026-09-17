import OBR from '@owlbear-rodeo/sdk';
import { EXTENSION_ID } from './constants';
import { formatShort } from './engine/format';
import { parse, parseAuto } from './engine/parser';
import type { Dialect } from './engine/ast';
import { MAX_ROLL_STEPS } from './engine/evaluate';
import { rollExpression, type RollExpressionInput } from './rollService';
import type { VerificationRecord } from './protocol';
import { VERIFY_VERSION, SeededRng, commitment, equalHex, finalSeed, secret, type RollIdentity } from './verificationCrypto';

export const VERIFY_CHANNEL=`${EXTENSION_ID}/verifiable-roll/v2`;
const TIMEOUT=8000, PRESENCE_TTL=30000, MAX_SESSIONS=64;
type Role='GM'|'PLAYER';
interface Peer { connectionId:string; role:Role; lastSeen:number }
type Message = { protocol:typeof VERIFY_VERSION; type:'hello'|'ping'|'ack'|'request'|'commit'|'reveal'|'abort'; rollId?:string; identity?:RollIdentity; dialect?:Dialect; value?:string; reason?:string };
interface Session { identity:RollIdentity; dialect:Dialect; own:string; commitments:Record<string,string>; reveals:Record<string,string>; stage:'request'|'committed'|'revealing'|'done'; resolve:(result:VerificationRecord)=>void; timer:ReturnType<typeof setTimeout>; created:number }
const validId=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<=128;
const validDigest=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
export function selectPeer(peers:Peer[], role:Role):Peer|undefined {
  return [...peers].filter(p=>role==='PLAYER'||p.role==='PLAYER')
    .sort((a,b)=>(role==='PLAYER'&&a.role!==b.role?(a.role==='GM'?-1:1):a.connectionId.localeCompare(b.connectionId)))[0];
}
export const canonicalExpression=(expression:string,dialect?:Dialect) => {
  const parsed=dialect?{ast:parse(expression,dialect),dialect}:parseAuto(expression);
  return { expression:formatShort(parsed.ast),dialect:parsed.dialect };
};
export class VerificationClient {
  private peers=new Map<string,Peer>();
  private sessions=new Map<string,Session>();
  private recent=new Set<string>();
  private party=new Map<string,Role>();
  private selfId='';
  private offMessage?:()=>void;private offParty?:()=>void;private interval?:ReturnType<typeof setInterval>;
  constructor(private roomId:string,private playerId:string,private role:Role,private onPresence:()=>void) {}
  get available(){return this.reachable.length>0;}
  get reachable(){this.expire();return [...this.peers.values()].filter(p=>p.connectionId!==this.selfId);}
  private send(message:Message){return OBR.broadcast.sendMessage(VERIFY_CHANNEL,message,{destination:'REMOTE'});}
  private presence(type:'hello'|'ping'|'ack'){void this.send({protocol:VERIFY_VERSION,type}).catch(()=>{});}
  async start(){
    this.selfId=await OBR.player.getConnectionId();
    this.offMessage=OBR.broadcast.onMessage(VERIFY_CHANNEL,event=>{void this.receive(event.data,event.connectionId);});
    this.offParty=OBR.party.onChange(players=>this.updateParty(players));
    this.updateParty(await OBR.party.getPlayers());this.presence('hello');
    this.interval=setInterval(()=>{this.expire();this.presence('ping');},10000);
  }
  stop(){this.offMessage?.();this.offParty?.();if(this.interval)clearInterval(this.interval);for(const session of this.sessions.values())this.finish(session,'Client closed');this.peers.clear();this.onPresence();}
  private updateParty(players:Awaited<ReturnType<typeof OBR.party.getPlayers>>){
    this.party=new Map(players.map(p=>[p.connectionId,p.role]));
    this.expire();this.presence('hello');
  }
  private expire(){let changed=false;for(const [id,peer] of this.peers)if(!this.party.has(id)||Date.now()-peer.lastSeen>PRESENCE_TTL){this.peers.delete(id);changed=true;for(const s of this.sessions.values())if(s.identity.peerConnectionId===id||s.identity.rollerConnectionId===id)this.finish(s,'Participant disconnected');}if(changed)this.onPresence();}
  private finish(s:Session,reason?:string){
    if(!this.sessions.has(s.identity.rollId))return;
    clearTimeout(s.timer);this.sessions.delete(s.identity.rollId);
    this.recent.add(s.identity.rollId);if(this.recent.size>256)this.recent.delete(this.recent.values().next().value!);
    const record:VerificationRecord={state:reason?'failed':'verified',reason,rollId:s.identity.rollId,protocol:VERIFY_VERSION,canonicalExpression:s.identity.expression,rollerConnectionId:s.identity.rollerConnectionId,peerConnectionId:s.identity.peerConnectionId,commitments:{...s.commitments},contributions:{...s.reveals}};
    if(!reason)void finalSeed(s.identity,s.reveals).then(async seed=>{
      // The peer independently runs the same evaluator; its result is never accepted from the wire.
      if(s.identity.peerConnectionId===this.selfId){
        const rng=await new SeededRng(seed).expand(MAX_ROLL_STEPS+128);
        rollExpression({requestId:s.identity.rollId,expression:s.identity.expression,dialect:s.dialect,visibility:'self',playerId:this.playerId,playerName:''},rng);
      }
      s.resolve({...record,finalSeed:seed});
    }).catch(()=>s.resolve({...record,state:'failed',reason:'Independent evaluation failed'}));
    else s.resolve(record);
  }
  private create(id:RollIdentity,dialect:Dialect):Session {
    if(this.sessions.size>=MAX_SESSIONS)throw new Error('Too many active verification sessions');
    const s:Session={identity:id,dialect,own:secret(),commitments:{},reveals:{},stage:'request',resolve:()=>{},created:Date.now(),timer:setTimeout(()=>{},0)};
    clearTimeout(s.timer);s.timer=setTimeout(()=>this.finish(s,'Verification timed out'),TIMEOUT);
    this.sessions.set(id.rollId,s);return s;
  }
  private async commit(s:Session){
    if(s.stage!=='request')return;
    s.stage='committed';
    const ownId=this.selfId;s.commitments[ownId]=await commitment(s.identity,ownId,s.own);
    await this.send({protocol:VERIFY_VERSION,type:'commit',rollId:s.identity.rollId,value:s.commitments[ownId]});
    await this.maybeReveal(s);
  }
  private async maybeReveal(s:Session){
    if(s.stage!=='committed'||Object.keys(s.commitments).length!==2)return;
    s.stage='revealing';s.reveals[this.selfId]=s.own;
    await this.send({protocol:VERIFY_VERSION,type:'reveal',rollId:s.identity.rollId,value:s.own});
  }
  private async receive(data:unknown,sender:string){
    if(!data||typeof data!=='object'||!this.party.has(sender)||sender===this.selfId)return;
    const m=data as Message;if(m.protocol!==VERIFY_VERSION)return;
    if(m.type==='hello'||m.type==='ping'||m.type==='ack'){
      const existing=this.peers.get(sender);
      this.peers.set(sender,{connectionId:sender,role:this.party.get(sender)!,lastSeen:Date.now()});
      if(!existing)this.onPresence();
      if(m.type!=='ack')this.presence('ack');return;
    }
    if(!validId(m.rollId)||!['request','commit','reveal','abort'].includes(m.type))return;
    if(m.type==='request'){
      const id=m.identity;
      if(!id||this.sessions.has(m.rollId)||this.recent.has(m.rollId)||this.sessions.size>=MAX_SESSIONS||id.rollId!==m.rollId||id.roomId!==this.roomId||id.rollerConnectionId!==sender||id.peerConnectionId!==this.selfId||!validId(id.rollId)||!validId(id.rollerConnectionId)||!validId(id.peerConnectionId)||typeof id.expression!=='string'||id.expression.length>1000)return;
      try {
        const parsed=canonicalExpression(id.expression,m.dialect);
        if(parsed.expression!==id.expression||parsed.dialect!==m.dialect)return;
        const s=this.create(id,parsed.dialect);await this.commit(s);
      }catch{return;}return;
    }
    const s=this.sessions.get(m.rollId);if(!s)return;
    const other=s.identity.rollerConnectionId===this.selfId?s.identity.peerConnectionId:s.identity.rollerConnectionId;
    if(sender!==other)return;
    if(m.type==='abort'){this.finish(s,'Peer aborted verification');return;}
    if(m.type==='commit'){
      if(!validDigest(m.value)||s.stage==='done'){this.finish(s,'Invalid commitment');return;}
      if(s.commitments[sender]){if(s.commitments[sender]!==m.value)this.finish(s,'Conflicting commitment');return;}
      s.commitments[sender]=m.value;
      if(!s.commitments[this.selfId])await this.commit(s);
      await this.maybeReveal(s);
      return;
    }
    if(m.type==='reveal'){
      if(s.stage!=='revealing'||!s.commitments[sender]||!validDigest(m.value)){this.finish(s,'Reveal before both commitments or invalid reveal');return;}
      if(s.reveals[sender]){if(s.reveals[sender]!==m.value)this.finish(s,'Conflicting reveal');return;}
      if(!equalHex(await commitment(s.identity,sender,m.value),s.commitments[sender])){this.finish(s,'Reveal does not match commitment');return;}
      s.reveals[sender]=m.value;this.finish(s);
    }
  }
  async roll(input:RollExpressionInput):Promise<{verification?:VerificationRecord}> {
    this.expire();const peer=selectPeer(this.reachable,this.role);if(!peer||!this.selfId)return {};
    const canonical=canonicalExpression(input.expression,input.dialect);
    const id:RollIdentity={roomId:this.roomId,rollId:crypto.randomUUID(),rollerConnectionId:this.selfId,peerConnectionId:peer.connectionId,expression:canonical.expression};
    const s=this.create(id,canonical.dialect);
    const result=new Promise<VerificationRecord>(resolve=>{s.resolve=resolve;});
    try {await this.send({protocol:VERIFY_VERSION,type:'request',rollId:id.rollId,identity:id,dialect:canonical.dialect});await this.commit(s);}
    catch {if(Object.keys(s.commitments).length<2){this.finish(s,'Peer unreachable');return {};}this.finish(s,'Communication failed');}
    const verification=await result;
    if(verification.state==='failed'&&Object.keys(verification.commitments??{}).length<2)return {};
    if(verification.state==='failed')return {verification};
    return {verification};
  }
}
