import { describe,expect,it } from 'vitest';
import { commitment,equalHex,finalSeed,SeededRng } from './verificationCrypto';
import { rollExpression } from './rollService';
import { selectPeer,canonicalExpression } from './verification';

const id={roomId:'room',rollId:'roll',rollerConnectionId:'a',peerConnectionId:'b',expression:'3d6!'};
describe('verified roll primitives',()=>{
  it('binds commitments to every roll field and rejects an invalid reveal',async()=>{
    const hash=await commitment(id,'a','11'.repeat(32));
    for(const changed of [{...id,expression:'2d6!'},{...id,rollId:'other'},{...id,peerConnectionId:'c'},{...id,rollerConnectionId:'c'}])
      expect(await commitment(changed,'a','11'.repeat(32))).not.toBe(hash);
    expect(equalHex(hash,await commitment(id,'a','22'.repeat(32)))).toBe(false);
  });
  it('derives identical order-independent seeds; either secret changes the seed',async()=>{
    const a='11'.repeat(32),b='22'.repeat(32);
    const seed=await finalSeed(id,{a,b});
    expect(seed).toBe(await finalSeed(id,{b,a}));
    expect(seed).not.toBe(await finalSeed(id,{a:'33'.repeat(32),b}));
    expect(seed).not.toBe(await finalSeed(id,{a,b:'33'.repeat(32)}));
  });
  it('reproduces the entire evaluator including explosions and rerolls',async()=>{
    const seed=await finalSeed(id,{a:'11'.repeat(32),b:'22'.repeat(32)});
    const input={requestId:'r',expression:'4d6! + 3d6r<3',visibility:'everyone' as const,playerId:'p',playerName:'P'};
    const first=rollExpression(input,await new SeededRng(seed).expand(20128));
    const second=rollExpression(input,await new SeededRng(seed).expand(20128));
    expect(first.record.value).toEqual(second.record.value);
    expect(first.record.trace).toEqual(second.record.trace);
  });
  it('uses deterministic GM preference and player ordering',()=>{
    const peers=[{connectionId:'z',role:'PLAYER' as const,lastSeen:1},{connectionId:'b',role:'GM' as const,lastSeen:1},{connectionId:'a',role:'PLAYER' as const,lastSeen:1}];
    expect(selectPeer(peers,'PLAYER')?.connectionId).toBe('b');
    expect(selectPeer(peers,'GM')?.connectionId).toBe('a');
  });
  it('canonicalizes inconsequential spacing',()=>{
    expect(canonicalExpression('2d6 + 1')).toEqual(canonicalExpression('2d6+1'));
  });
});
