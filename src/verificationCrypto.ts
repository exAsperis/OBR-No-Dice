import type { Rng } from './engine/evaluate';

export const VERIFY_VERSION = 'NODICE_VERIFIABLE_ROLL_V1';
const encoder = new TextEncoder();
export const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export function unhex(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('Invalid 256-bit value');
  return Uint8Array.from(value.match(/../g)!, pair => parseInt(pair, 16));
}
export const secret = (): string => hex(crypto.getRandomValues(new Uint8Array(32)));
export interface RollIdentity { roomId:string; rollId:string; rollerConnectionId:string; peerConnectionId:string; expression:string }
/** Fixed key order and JSON escaping define the V1 wire/hash serialization. */
export const identity = (r: RollIdentity) => [VERIFY_VERSION,r.roomId,r.rollId,r.rollerConnectionId,r.peerConnectionId,r.expression];
export async function digest(parts: unknown[]): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(parts)))));
}
export const commitment = (r: RollIdentity, contributor: string, contribution: string) =>
  digest(['commit',...identity(r),contributor,contribution]);
export const finalSeed = (r: RollIdentity, contributions: Record<string,string>) =>
  digest(['final-seed',...identity(r),...Object.entries(contributions).sort(([a],[b]) => a.localeCompare(b))]);
export function equalHex(a:string,b:string):boolean {
  if(a.length!==b.length)return false;
  let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
}
/** SHA-256 counter-mode byte stream. Integer sampling uses the same rejection rule as production. */
export class SeededRng implements Rng {
  private counter=0;
  private block=new Uint8Array(0);
  private offset=0;
  constructor(private readonly seed: string) { unhex(seed); }
  private async nextBlock() {
    if(this.counter>=0x100000000)throw new Error('Random stream exhausted');
    const counter=new Uint8Array(4);new DataView(counter.buffer).setUint32(0,this.counter++,false);
    const prefix=encoder.encode('No Dice verified RNG V1\0');
    const input=new Uint8Array(prefix.length+32+4);input.set(prefix);input.set(unhex(this.seed),prefix.length);input.set(counter,prefix.length+32);
    this.block=new Uint8Array(await crypto.subtle.digest('SHA-256',input));this.offset=0;
  }
  async integerAsync(maxExclusive:number):Promise<number> {
    if(!Number.isSafeInteger(maxExclusive)||maxExclusive<1||maxExclusive>0x100000000)throw new Error('Invalid random range');
    const limit=Math.floor(0x100000000/maxExclusive)*maxExclusive;
    let value:number;
    do {
      if(this.offset+4>this.block.length)await this.nextBlock();
      value=new DataView(this.block.buffer,this.block.byteOffset+this.offset,4).getUint32(0,false);this.offset+=4;
    }while(value>=limit);
    return value%maxExclusive;
  }
  integer():number { throw new Error('Seeded RNG must be expanded before synchronous evaluation'); }
  async expand(draws:number):Promise<Rng> {
    const values:number[]=[];
    // Each evaluation is bounded to MAX_ROLL_STEPS; pre-expand full 32-bit draws,
    // including rejected samples. Exhaustion is explicitly an error, never local RNG.
    for(let i=0;i<draws;i++) {
      if(this.offset+4>this.block.length)await this.nextBlock();
      values.push(new DataView(this.block.buffer,this.block.byteOffset+this.offset,4).getUint32(0,false));this.offset+=4;
    }
    let position=0;
    return { integer(maxExclusive:number) {
      if(!Number.isSafeInteger(maxExclusive)||maxExclusive<1||maxExclusive>0x100000000)throw new Error('Invalid random range');
      const limit=Math.floor(0x100000000/maxExclusive)*maxExclusive;
      let value:number;do { if(position>=values.length)throw new Error('Verified random stream exhausted'); value=values[position++]; }while(value>=limit);
      return value%maxExclusive;
    } };
  }
}
