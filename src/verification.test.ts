import { afterEach,describe,expect,it,vi } from 'vitest';
import { commitment,VERIFY_VERSION } from './verificationCrypto';
import { VERIFY_CHANNEL,VerificationClient } from './verification';

const bus=vi.hoisted(()=>({handler:undefined as undefined|((event:{data:unknown;connectionId:string})=>void),sent:[] as unknown[]}));
vi.mock('@owlbear-rodeo/sdk',()=>({default:{
  player:{getConnectionId:async()=> 'a'},
  party:{getPlayers:async()=>[{id:'other',connectionId:'b',role:'GM'}],onChange:()=>()=>{}},
  broadcast:{onMessage:(_channel:string,handler:typeof bus.handler)=>{bus.handler=handler;return()=>{bus.handler=undefined;}},sendMessage:async(_channel:string,message:unknown)=>{bus.sent.push(message);}},
}}));
const input={requestId:'ui',expression:'d6',visibility:'everyone' as const,playerId:'me',playerName:'Me'};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
afterEach(()=>{vi.useRealTimers();bus.sent.length=0;bus.handler=undefined;});
describe('verification session transitions',()=>{
  it('discovers a peer when the party list contains only other players',async()=>{
    const changes:boolean[]=[];
    const client=new VerificationClient('room','me','PLAYER',()=>changes.push(client.available));
    await client.start();
    expect(client.available).toBe(false);
    bus.handler?.({data:{protocol:VERIFY_VERSION,type:'ack'},connectionId:'b'});
    expect(client.available).toBe(true);
    expect(changes).toContain(true);
    client.stop();
  });
  it('aborts after both commitments if the peer never reveals',async()=>{
    vi.useFakeTimers();
    const client=new VerificationClient('room','me','PLAYER',()=>{});await client.start();
    bus.handler?.({data:{protocol:VERIFY_VERSION,type:'ack'},connectionId:'b'});
    const pending=client.roll(input);await flush();
    const request=bus.sent.find((m:any)=>m.type==='request') as any;
    expect(request.identity.peerConnectionId).toBe('b');
    const value=await commitment(request.identity,'b','12'.repeat(32));
    bus.handler?.({data:{protocol:VERIFY_VERSION,type:'commit',rollId:request.rollId,value},connectionId:'b'});
    await flush();
    expect(bus.sent.some((m:any)=>m.type==='reveal')).toBe(true);
    await vi.advanceTimersByTimeAsync(8001);
    const result=await pending;
    expect(result.verification?.state).toBe('failed');
    expect(result.verification?.reason).toMatch(/timed out/);
    client.stop();
  });
  it('rejects an early reveal instead of accepting it',async()=>{
    vi.useFakeTimers();const client=new VerificationClient('room','me','PLAYER',()=>{});await client.start();
    bus.handler?.({data:{protocol:VERIFY_VERSION,type:'ack'},connectionId:'b'});
    const pending=client.roll(input);await flush();
    const request=bus.sent.find((m:any)=>m.type==='request') as any;
    bus.handler?.({data:{protocol:VERIFY_VERSION,type:'reveal',rollId:request.rollId,value:'12'.repeat(32)},connectionId:'b'});
    await flush();
    expect((await pending).verification).toBeUndefined(); // Pre-commit failure permits local fallback.
    client.stop();
  });
});
