import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { PlayerColorRegistry } from '../playerColors';
import { PlayerName } from './PlayerName';

class FakeChannel {
  static instances:FakeChannel[]=[];
  onmessage:((event:MessageEvent<unknown>)=>void)|null=null;
  constructor(public name:string){FakeChannel.instances.push(this);}
  postMessage(){} close(){}
}
const original=globalThis.BroadcastChannel;
beforeEach(()=>{localStorage.clear();FakeChannel.instances=[];globalThis.BroadcastChannel=FakeChannel as unknown as typeof BroadcastChannel;});
afterEach(()=>{globalThis.BroadcastChannel=original;});

it('renders a stored color and responds to the shared live color channel',()=>{
  new PlayerColorRegistry('room','viewer').remember({id:'joe',color:'#112233'},1);
  render(<PlayerName roomId="room" viewerId="viewer" playerId="joe" name="Joe"/>);
  const disk=screen.getByText('Joe').querySelector('.player-color-disk') as HTMLElement;
  expect(disk.style.backgroundColor).toBe('rgb(17, 34, 51)');
  const listener=FakeChannel.instances.find(channel=>channel.onmessage);
  act(()=>listener?.onmessage?.({data:{type:'player-color',roomId:'room',viewerId:'viewer',playerId:'joe',color:'#abcdef'}} as MessageEvent));
  expect(disk.style.backgroundColor).toBe('rgb(171, 205, 239)');
});
