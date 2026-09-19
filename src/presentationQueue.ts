export interface PresentationItem { requestId: string }

/** Serializes result presentation. An entry resolves only when its matching storage acknowledgement completes it. */
export class PresentationQueue<T extends PresentationItem> {
  private queued: Array<{item:T;resolve:()=>void;reject:(error:unknown)=>void;order:number}> = [];
  private promises = new Map<string,Promise<void>>();
  private activeEntry: {item:T;resolve:()=>void;reject:(error:unknown)=>void;order:number}|null = null;
  private reservation:string|null=null;
  private idleWaiters = new Set<()=>void>();
  private reservationWaiters:Array<{requestId:string;resolve:()=>void;order:number}>=[];
  private order=0;
  constructor(private start:(item:T)=>void|Promise<void>,private state:(busy:boolean,requestId?:string)=>void){ }
  get active():T|undefined{return this.activeEntry?.item;}
  get busy(){return this.reservation!==null||this.activeEntry!==null||this.queued.length>0;}
  enqueue(item:T):Promise<void>{
    const existing=this.promises.get(item.requestId);if(existing)return existing;
    let resolve!:()=>void,reject!:(error:unknown)=>void;
    const promise=new Promise<void>((ok,fail)=>{resolve=ok;reject=fail;});
    this.promises.set(item.requestId,promise);
    const entry={item,resolve,reject,order:++this.order};
    if(this.reservation===item.requestId)this.queued.unshift(entry);else this.queued.push(entry);
    this.drain();
    return promise;
  }
  complete(requestId:string){this.settle(requestId);}
  fail(requestId:string,error:unknown){this.settle(requestId,error);}
  async reserve(requestId:string):Promise<void>{
    if(this.busy){await new Promise<void>(resolve=>this.reservationWaiters.push({requestId,resolve,order:++this.order}));return;}
    this.reservation=requestId;this.state(true,requestId);
  }
  release(requestId:string){if(this.reservation!==requestId)return;this.reservation=null;this.drain();}
  waitUntilIdle():Promise<void>{return this.busy?new Promise(resolve=>this.idleWaiters.add(resolve)):Promise.resolve();}
  private settle(requestId:string,error?:unknown){
    if(this.activeEntry?.item.requestId!==requestId)return;
    const entry=this.activeEntry;this.activeEntry=null;
    if(error===undefined)entry.resolve();else entry.reject(error);
    this.drain();
  }
  private drain(){
    if(this.activeEntry||this.reservation)return;
    const reserved=this.reservationWaiters[0],queued=this.queued[0];
    if(reserved&&(!queued||reserved.order<queued.order)){this.reservationWaiters.shift();this.reservation=reserved.requestId;this.state(true,reserved.requestId);reserved.resolve();return;}
    const next=this.queued.shift();
    if(!next){this.state(false);for(const resolve of this.idleWaiters)resolve();this.idleWaiters.clear();return;}
    this.activeEntry=next;this.state(true,next.item.requestId);
    void Promise.resolve(this.start(next.item)).catch(error=>this.fail(next.item.requestId,error));
  }
}
