import { useEffect, useState } from 'react';
import { getStoredPlayerColor, PLAYER_COLORS_CHANNEL } from '../playerColors';

export function usePlayerColor(roomId:string|undefined,viewerId:string|undefined,playerId:string):string|undefined{
  const read=()=>roomId&&viewerId?getStoredPlayerColor(roomId,viewerId,playerId)?.color:undefined;
  const [color,setColor]=useState(read);
  useEffect(()=>{
    setColor(read());
    if(!roomId||!viewerId||typeof BroadcastChannel==='undefined')return;
    const channel=new BroadcastChannel(PLAYER_COLORS_CHANNEL);
    channel.onmessage=(event:MessageEvent<unknown>)=>{const message=event.data as Partial<{type:string;roomId:string;viewerId:string;playerId:string;color:string}>;if(message?.type==='player-color'&&message.roomId===roomId&&message.viewerId===viewerId&&message.playerId===playerId)setColor(message.color);};
    return()=>channel.close();
  },[roomId,viewerId,playerId]);
  return color;
}
