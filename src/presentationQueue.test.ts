import {describe,expect,it} from 'vitest';
import {PresentationQueue} from './presentationQueue';

const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};};

describe('presentation lifecycle queue',()=>{
  it('keeps presentations FIFO until matching storage completion',async()=>{
    const starts:string[]=[];const states:Array<[boolean,string|undefined]>=[];
    const queue=new PresentationQueue<{requestId:string}>(item=>{starts.push(item.requestId);},(busy,id)=>states.push([busy,id]));
    const a=queue.enqueue({requestId:'A'}),b=queue.enqueue({requestId:'B'}),c=queue.enqueue({requestId:'C'});
    expect(starts).toEqual(['A']);expect(queue.active?.requestId).toBe('A');
    queue.complete('B');expect(starts).toEqual(['A']);
    queue.complete('A');await a;expect(starts).toEqual(['A','B']);
    queue.complete('B');await b;expect(starts).toEqual(['A','B','C']);
    queue.complete('C');await c;expect(states.at(-1)).toEqual([false,undefined]);
    expect(states.filter(([busy])=>!busy)).toHaveLength(1);
  });
  it('deduplicates request IDs and recovers after failure',async()=>{
    const starts:string[]=[];const queue=new PresentationQueue<{requestId:string}>(item=>{starts.push(item.requestId);},()=>{});
    const first=queue.enqueue({requestId:'same'});const duplicate=queue.enqueue({requestId:'same'});
    expect(duplicate).toBe(first);queue.fail('same',new Error('storage failed'));
    await expect(first).rejects.toThrow('storage failed');
    const next=queue.enqueue({requestId:'next'});expect(starts).toEqual(['same','next']);queue.complete('next');await next;
  });
  it('waits for the active lifecycle rather than polling',async()=>{
    const gate=deferred();const queue=new PresentationQueue<{requestId:string}>(()=>gate.promise,()=>{});
    const active=queue.enqueue({requestId:'A'});let idle=false;void queue.waitUntilIdle().then(()=>{idle=true;});
    await Promise.resolve();expect(idle).toBe(false);gate.resolve();queue.complete('A');await active;await queue.waitUntilIdle();expect(idle).toBe(true);
  });
  it('reserves the idle slot before API evaluation and queues manual results behind it',async()=>{
    const starts:string[]=[];const states:Array<[boolean,string|undefined]>=[];
    const queue=new PresentationQueue<{requestId:string}>(item=>{starts.push(item.requestId);},(busy,id)=>states.push([busy,id]));
    await queue.reserve('api');
    const manual=queue.enqueue({requestId:'manual'});expect(starts).toEqual([]);expect(states.at(-1)).toEqual([true,'api']);
    const api=queue.enqueue({requestId:'api'});queue.release('api');expect(starts).toEqual(['api']);
    queue.complete('api');await api;expect(starts).toEqual(['api','manual']);queue.complete('manual');await manual;
  });
  it('hands an active presentation directly to a waiting reservation without an idle flicker',async()=>{
    const states:Array<[boolean,string|undefined]>=[];const queue=new PresentationQueue<{requestId:string}>(()=>{},(busy,id)=>states.push([busy,id]));
    const manual=queue.enqueue({requestId:'manual'});const reserved=queue.reserve('api');queue.complete('manual');await manual;await reserved;
    expect(states).toEqual([[true,'manual'],[true,'api']]);queue.release('api');expect(states.at(-1)).toEqual([false,undefined]);
  });
});
