import OBR from '@owlbear-rodeo/sdk';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StatusPanel } from './components/StatusPanel';
import type { Value } from './engine/evaluate';
import type { Dialect } from './engine/ast';
import type { Distribution } from './engine/probability';
import type { FairnessSnapshot } from './engine/fairness';
import { useOwlbear } from './hooks/useOwlbear';
import { defaultSessionName, ensureSession, getRecentRolls, getSessionRolls, localDateTime, migrationPreview, migrateHistory, parseLocalDateTime, readSharedSession, renameSession, rollbackSessionSplit, SESSION_KEY, startSession, LEDGER_CHANNEL, type DiceSession, type StoredRoll } from './sessionLedger';
import { detectStaleSession, reminderKey } from './staleSession';
import { EXTENSION_ID } from './constants';
import { encryptForGm } from './gmCrypto';
import { GM_CHANNEL, isRequest, isResult, REQUEST_CHANNEL, RESULT_CHANNEL, type RollRequest, type RollResult, type Visibility } from './protocol';
import { isLocalMessage, LOCAL_CHANNEL, type LocalMessage } from './revealProtocol';
import { displayValue, rollExpression } from './rollService';
import { applyDiceShortcutOnce } from './shortcuts';
import { PANEL_CHANNEL, isPanelMessage, type PanelCommand, type PanelMessage } from './panelProtocol';
import { DEFAULT_COLLAPSED, loadCollapsed, loadDraft, loadShowWork, saveCollapsed, saveDraft, saveShowWork } from './panelLayout';
import { RELEASE_VERSION } from './version';
import { DEFAULT_ROOM_SETTINGS, readRoomSettings, type RoomSettings } from './roomSettings';
import { GMSettings } from './GMSettings';
import { NotationPopover } from './components/NotationPopover';
import { VERIFY_LOCAL_CHANNEL, type VerificationLocalMessage } from './verificationBridge';
import { SeededRng, VERIFY_VERSION } from './verificationCrypto';
import { MAX_ROLL_STEPS } from './engine/evaluate';
import { ResultDisplay } from './ResultDisplay';
import { resizeExpressionEditor } from './expressionEditor';
import { ledgerWorkRows } from './ledgerWork';
import { chartBarTooltip, displayedRolls, inclusiveTails } from './rollPresentation';
import type { RollMoment } from './rollMoments';
import './statistics.css';

const display=displayValue;
const MAX_VISIBLE_BARS=200;
export default function App() {
  const obr=useOwlbear();
  const [expression,setExpression]=useState('');
  const [dialectHint,setDialectHint]=useState<Dialect|undefined>(undefined);
  const [detectedDialect,setDetectedDialect]=useState<Dialect|undefined>(undefined);
  const [visibility,setVisibility]=useState<Visibility>('everyone');
  const [history,setHistory]=useState<RollResult[]>([]);
  const [session,setSession]=useState<DiceSession|null>(null);
  const [sessionDialog,setSessionDialog]=useState<'new'|'rename'|null>(null);
  const [sessionName,setSessionName]=useState('');
  const [sessionStart,setSessionStart]=useState('');
  const [sessionRolls,setSessionRolls]=useState<StoredRoll[]>([]);
  const [sessionRollsLoaded,setSessionRollsLoaded]=useState(false);
  const [sessionRollsForId,setSessionRollsForId]=useState('');
  const [momentsByRollId,setMomentsByRollId]=useState<Map<string,RollMoment[]>>(new Map());
  const momentsWorker=useRef<Worker|null>(null);
  const momentsSequence=useRef(0);
  const [sessionError,setSessionError]=useState('');
  const [dismissedReminder,setDismissedReminder]=useState('');
  const [chart,setChart]=useState<Distribution|null>(null);
  const [chartError,setChartError]=useState('');
  const [fairness,setFairness]=useState<FairnessSnapshot|null>(null);
  const [fairnessRunning,setFairnessRunning]=useState(false);
  const [fairnessError,setFairnessError]=useState('');
  const [notation,setNotation]=useState<{short:string;longReadable:string;longExpanded:string}|null>(null);
  const [inputError,setInputError]=useState('');
  const [selected,setSelected]=useState<RollResult|null>(null);
  const [chartRolls,setChartRolls]=useState<Value[]>([]);
  const [busy,setBusy]=useState(false);
  const [rollingRequestId,setRollingRequestId]=useState<string|null>(null);
  const [roomSettings,setRoomSettings]=useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [verifiableRollsAvailable,setVerifiableRollsAvailable]=useState(false);
  const verifierChannel=useRef<BroadcastChannel|null>(null);
  const pendingVerification=useRef(new Map<string,(record?:RollResult['verification'])=>void>());
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [collapsed,setCollapsed]=useState(DEFAULT_COLLAPSED);
  const [preferencesReady,setPreferencesReady]=useState(false);
  const panelChannel=useRef<BroadcastChannel|null>(null);
  const panelRef=useRef<HTMLElement|null>(null);
  const historyPreviewRef=useRef<HTMLSpanElement|null>(null);
  const recentCardRef=useRef<HTMLElement|null>(null);
  const [rollingCardHeight,setRollingCardHeight]=useState<number|null>(null);
  const [showWorkOpen,setShowWorkOpen]=useState(false);
  const [historyPreviewCount,setHistoryPreviewCount]=useState(Number.POSITIVE_INFINITY);
  const dragStart=useRef<{x:number;y:number}|null>(null);
  const seenShortcutIds=useRef(new Set<string>());
  const worker=useRef<Worker|null>(null);
  const fairnessWorker=useRef<Worker|null>(null);
  const fairnessId=useRef(0);
  const revealChannel=useRef<BroadcastChannel|null>(null);
  const sequence=useRef(0);
  const historyRef=useRef<RollResult[]>([]);
  const pendingLocalRolls=useRef(new Set<string>());
  const inputRef=useRef<HTMLTextAreaElement|null>(null);
  const currentInput=useRef({expression,dialect:detectedDialect});
  currentInput.current={expression,dialect:detectedDialect};
  const rememberRecentCardHeight=()=>{const height=recentCardRef.current?.getBoundingClientRect().height;if(height)setRollingCardHeight(height);};
  useLayoutEffect(()=>{if(inputRef.current)resizeExpressionEditor(inputRef.current);},[expression]);
  useEffect(()=>{
    const editor=inputRef.current;
    if(!editor||typeof ResizeObserver==='undefined')return;
    let width=editor.clientWidth;
    const observer=new ResizeObserver(()=>{if(editor.clientWidth!==width){width=editor.clientWidth;resizeExpressionEditor(editor);}});
    observer.observe(editor);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!obr.roomId||!obr.playerId)return;
    if(new URLSearchParams(window.location.search).get('resume')==='1'){
      const saved=loadDraft(obr.roomId,obr.playerId);
      if(saved!==null)setExpression(saved);
    }
    setCollapsed(loadCollapsed(obr.playerId));
    setShowWorkOpen(loadShowWork(obr.roomId,obr.playerId));
    setPreferencesReady(true);
  },[obr.roomId,obr.playerId]);
  useEffect(()=>{
    if(!preferencesReady||!obr.roomId||!obr.playerId)return;
    saveDraft(obr.roomId,obr.playerId,expression);
  },[expression,preferencesReady,obr.roomId,obr.playerId]);
  useEffect(()=>{
    if(!preferencesReady||!obr.playerId)return;
    saveCollapsed(obr.playerId,collapsed);
  },[collapsed,preferencesReady,obr.playerId]);
  useEffect(()=>{
    if(!preferencesReady||!obr.roomId||!obr.playerId)return;
    const channel=new BroadcastChannel(PANEL_CHANNEL);
    panelChannel.current=channel;
    channel.onmessage=(event:MessageEvent<unknown>)=>{
      if(!isPanelMessage(event.data)||event.data.roomId!==obr.roomId||event.data.playerId!==obr.playerId)return;
      if(event.data.type==='apply-shortcut')useShortcut(event.data.term,event.data.requestId);
      if(event.data.type==='focus')requestAnimationFrame(()=>inputRef.current?.focus());
    };
    channel.postMessage({type:'ready',roomId:obr.roomId,playerId:obr.playerId} satisfies PanelMessage);
    return ()=>{channel.close();panelChannel.current=null;};
  // The shortcut handler updates current React state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[obr.roomId,obr.playerId,preferencesReady]);
  useEffect(()=>{
    if(obr.status!=='ready')return;
    let active=true;
    let changed=false;
    const unsubscribe=OBR.room.onMetadataChange(metadata=>{changed=true;setRoomSettings(readRoomSettings(metadata));});
    void OBR.room.getMetadata().then(metadata=>{if(active&&!changed)setRoomSettings(readRoomSettings(metadata));}).catch(()=>{});
    return ()=>{active=false;unsubscribe();};
  },[obr.status]);
  useEffect(()=>{
    if(obr.status!=='ready'||!obr.roomId||!obr.playerId)return;
    let active=true;const room=obr.roomId,player=obr.playerId;
    const accept=(metadata:Record<string,unknown>)=>{const shared=readSharedSession(metadata);void ensureSession(room,player,shared).then(value=>{if(active)setSession(value);}).catch(()=>{});};
    const unsubscribe=OBR.room.onMetadataChange(accept);
    void OBR.room.getMetadata().then(async metadata=>{if(!active)return;const shared=readSharedSession(metadata);await migrateHistory(room,player,shared);if(active)setSession(await ensureSession(room,player,shared));}).catch(async()=>{if(active)setSession(await ensureSession(room,player));});
    return()=>{active=false;unsubscribe();};
  },[obr.status,obr.roomId,obr.playerId,obr.role]);
  useEffect(()=>{
    if(!session||!obr.roomId||!obr.playerId)return;
    let active=true;const room=obr.roomId,player=obr.playerId;
    setSessionRollsLoaded(false);setSessionRollsForId('');setSessionRolls([]);
    const refresh=()=>{void getSessionRolls(room,player,session.id).then(rolls=>{if(active){setSessionRolls(rolls);setSessionRollsForId(session.id);setSessionRollsLoaded(true);}}).catch(()=>{if(active)setSessionError('Could not load the current session rolls.');});};
    refresh();const channel=new BroadcastChannel(LEDGER_CHANNEL);
    channel.onmessage=event=>{if(event.data?.roomId===room&&event.data?.playerId===player)refresh();};
    return()=>{active=false;channel.close();};
  },[session?.id,obr.roomId,obr.playerId]);
  useEffect(()=>{
    const w=new Worker(new URL('./moments.worker.ts',import.meta.url),{type:'module'});momentsWorker.current=w;
    w.onmessage=(event:MessageEvent<{id:number;moments:[string,RollMoment[]][]}>)=>{if(event.data.id===momentsSequence.current)setMomentsByRollId(new Map(event.data.moments));};
    return()=>{w.terminate();momentsWorker.current=null;};
  },[]);
  useEffect(()=>{
    const id=++momentsSequence.current;
    setMomentsByRollId(new Map());
    if(sessionRollsLoaded&&sessionRollsForId===session?.id)momentsWorker.current?.postMessage({id,rolls:sessionRolls});
  },[session?.id,sessionRolls,sessionRollsLoaded,sessionRollsForId]);
  useEffect(()=>{
    if(obr.status!=='ready'||!obr.roomId||!obr.playerId)return;
    const channel=new BroadcastChannel(VERIFY_LOCAL_CHANNEL);verifierChannel.current=channel;
    channel.onmessage=(event:MessageEvent<VerificationLocalMessage>)=>{
      const m=event.data;if(!m||m.roomId!==obr.roomId||m.playerId!==obr.playerId)return;
      if(m.type==='status')setVerifiableRollsAvailable(m.available===true);
      if(m.type==='roll-response'){pendingVerification.current.get(m.requestId)?.(m.verification);pendingVerification.current.delete(m.requestId);}
    };
    channel.postMessage({type:'status-request',roomId:obr.roomId,playerId:obr.playerId} satisfies VerificationLocalMessage);
    return ()=>{channel.close();verifierChannel.current=null;for(const done of pendingVerification.current.values())done();pendingVerification.current.clear();setVerifiableRollsAvailable(false);};
  },[obr.status,obr.roomId,obr.playerId,obr.role]);
  useEffect(()=>{
    if(!preferencesReady||!obr.roomId||!obr.playerId||!panelRef.current)return;
    const panel=panelRef.current;
    const roomId=obr.roomId, playerId=obr.playerId;
    let frame=0;
    let lastHeight=0;
    const measure=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const height=Math.ceil(panel.getBoundingClientRect().height);
        if(height>0&&Math.abs(height-lastHeight)>=2){
          lastHeight=height;
          panelChannel.current?.postMessage({type:'resize',roomId,playerId,height} satisfies PanelMessage);
        }
      });
    };
    const observer=new ResizeObserver(measure);
    observer.observe(panel);
    measure();
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();};
  },[preferencesReady,obr.roomId,obr.playerId]);
  const add=(result:RollResult)=>{ if(historyRef.current.some(x=>x.requestId===result.requestId)) return; const next=[...historyRef.current,result].slice(-100); historyRef.current=next; setHistory(next); if(!result.error&&result.expression===currentInput.current.expression&&result.dialect===currentInput.current.dialect)setChartRolls(previous=>[...previous,result.value]); };
  useEffect(()=>{if(!obr.roomId||!obr.playerId)return;let active=true;void migrateHistory(obr.roomId,obr.playerId).then(()=>getRecentRolls(obr.roomId!,obr.playerId!)).then(stored=>{if(active){historyRef.current=stored;setHistory(stored);}}).catch(()=>{});return()=>{active=false;};},[obr.roomId,obr.playerId]);
  useEffect(()=>{
    if(!obr.roomId||!obr.playerId)return;
    const channel=new BroadcastChannel(LOCAL_CHANNEL);revealChannel.current=channel;
    channel.onmessage=(event:MessageEvent<unknown>)=>{
      if(!isLocalMessage(event.data)||event.data.roomId!==obr.roomId||event.data.playerId!==obr.playerId)return;
      if(event.data.type==='reroll-started'){
        rememberRecentCardHeight();
        setRollingRequestId(event.data.requestId);
        setCollapsed(previous=>({...previous,recent:false}));
        pendingLocalRolls.current.add(event.data.requestId);
        return;
      }
      if(event.data.type==='reroll-error'){
        const requestId=event.data.requestId;
        setRollingRequestId(current=>current===requestId?null:current);
        pendingLocalRolls.current.delete(requestId);
        return;
      }
      if(event.data.type==='revealed'&&isResult(event.data.result)){
        const result=event.data.result;
        add(result);
        setRollingRequestId(current=>current===result.requestId?null:current);
        if(pendingLocalRolls.current.delete(result.requestId)){setSelected(result);setInputError('');}
      }
    };
    return ()=>{channel.close();revealChannel.current=null;};
  // The listener uses refs and functional state updates to process current results.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[obr.roomId,obr.playerId]);
  useEffect(()=>{
    const w=new Worker(new URL('./probability.worker.ts',import.meta.url),{type:'module'}); worker.current=w;
    w.onmessage=(event:MessageEvent<{id:number;dialect?:Dialect;result?:Distribution;notation?:{short:string;longReadable:string;longExpanded:string};error?:string;incomplete?:boolean}>)=>{ if(event.data.id!==sequence.current)return; setChart(event.data.result??null); setDetectedDialect(event.data.dialect); setNotation(event.data.notation??null); setChartError(event.data.incomplete?'':event.data.error??''); };
    return ()=>{w.terminate();worker.current=null;};
  },[]);
  useEffect(()=>{
    const w=new Worker(new URL('./fairness.worker.ts',import.meta.url),{type:'module'}); fairnessWorker.current=w;
    w.onmessage=(event:MessageEvent<{id:number;type:'snapshot'|'error';snapshot?:FairnessSnapshot;running?:boolean;error?:string}>)=>{
      if(event.data.id!==fairnessId.current)return;
      if(event.data.type==='snapshot') { setFairness(event.data.snapshot??null); setFairnessRunning(Boolean(event.data.running)); }
      else { setFairnessError(event.data.error??'Sampling failed'); setFairnessRunning(false); }
    };
    return ()=>{w.terminate();fairnessWorker.current=null;};
  },[]);
  useEffect(()=>{
    const id=++sequence.current; setChart(null); setDetectedDialect(undefined); setNotation(null); setChartError('');
    setChartRolls([]);setSelected(null);
    const previous=fairnessId.current++; fairnessWorker.current?.postMessage({type:'stop',id:previous});
    setFairness(null); setFairnessRunning(false); setFairnessError('');
    if(!expression.trim())return;
    const t=window.setTimeout(()=>worker.current?.postMessage({id,expression,dialect:dialectHint}),150);
    return ()=>window.clearTimeout(t);
  },[expression,dialectHint]);
  useEffect(()=>{
    if(obr.status!=='ready'||!obr.playerId)return;
    const requestOff=OBR.broadcast.onMessage(REQUEST_CHANNEL,event=>{ if(obr.role==='GM'&&isRequest(event.data)&&event.data.expression.length<=1000&&event.data.visibility!=='gm') void perform(event.data,false); });
    return ()=>{requestOff();};
  // Register once for this player. Other state is read from the current closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[obr.status,obr.playerId,obr.playerName,obr.role]);
  async function perform(req:RollRequest,local:boolean) {
    setBusy(true);
    try {
      const v=req.visibility??'everyone';
      const input={
        requestId:req.requestId,expression:req.expression,dialect:req.dialect,visibility:v,
        playerId:obr.playerId??'',playerName:obr.playerName??'Player',label:req.label,source:req.source,
      };
      const verification=local&&roomSettings.verifiableRollsEnabled&&obr.roomId&&obr.playerId&&verifierChannel.current
        ? await new Promise<RollResult['verification']|undefined>(resolve=>{
          const timeout=setTimeout(()=>{pendingVerification.current.delete(req.requestId);resolve({state:'failed',reason:'Verification service did not respond',rollId:req.requestId,protocol:VERIFY_VERSION,canonicalExpression:req.expression,rollerConnectionId:'',peerConnectionId:''});},15000);
          pendingVerification.current.set(req.requestId,record=>{clearTimeout(timeout);resolve(record);});
          verifierChannel.current!.postMessage({type:'roll',roomId:obr.roomId!,playerId:obr.playerId!,requestId:req.requestId,input} satisfies VerificationLocalMessage);
        }):undefined;
      const verified=verification?{verification,rng:verification.state==='verified'?await new SeededRng(verification.finalSeed!).expand(MAX_ROLL_STEPS+128):undefined}:undefined;
      const {record:result}=verified?.verification?.state==='failed'
        ? {record:{version:1 as const,requestId:req.requestId,expression:req.expression,dialect:req.dialect??'nodice' as Dialect,visibility:v,playerId:input.playerId,playerName:input.playerName,value:'' as const,trace:[],time:Date.now(),error:'Verification failed',verification:verified.verification}}
        : rollExpression(input,verified?.rng);
      if(verified?.verification?.state==='verified')result.verification=verified.verification;
      const d=result.dialect;
      if(local&&req.expression===currentInput.current.expression)currentInput.current.dialect=d;
      if(v==='everyone') await OBR.broadcast.sendMessage(RESULT_CHANNEL,result);
      if(v==='gm'&&obr.role!=='GM') await OBR.broadcast.sendMessage(GM_CHANNEL,await encryptForGm(result));
      if(local)pendingLocalRolls.current.add(result.requestId);
      if(obr.roomId&&obr.playerId)revealChannel.current?.postMessage({type:'result',roomId:obr.roomId,playerId:obr.playerId,result} satisfies LocalMessage);
      if(local)setInputError('');
    } catch(error) {
      pendingLocalRolls.current.delete(req.requestId);
      const message=error instanceof Error?error.message:'Roll failed';
      if(local){setInputError(message);setRollingRequestId(current=>current===req.requestId?null:current);}
      else if((req.visibility??'everyone')==='everyone') {
        const failed:RollResult={version:1,requestId:req.requestId,expression:req.expression,dialect:req.dialect??'nodice',visibility:'everyone',playerId:obr.playerId??'',playerName:obr.playerName??'Player',value:'',trace:[],time:Date.now(),error:message,source:req.source,label:req.label};
        await OBR.broadcast.sendMessage(RESULT_CHANNEL,failed).catch(()=>{});
      }
    }
    finally {setBusy(false);}
  }
  function submit() { if(busy||!expression.trim())return;rememberRecentCardHeight();const requestId=crypto.randomUUID();setRollingRequestId(requestId);setCollapsed(previous=>({...previous,recent:false}));void perform({version:1,requestId,expression,dialect:dialectHint,visibility},true); }
  function useShortcut(term:string,requestId:string) {
    const next=applyDiceShortcutOnce(currentInput.current.expression,term,requestId,seenShortcutIds.current);
    if(next===null)return;
    currentInput.current.expression=next;
    setExpression(next);setDialectHint(undefined);setSelected(null);setInputError('');
    requestAnimationFrame(()=>{inputRef.current?.focus();inputRef.current?.setSelectionRange(next.length,next.length);});
  }
  function resetFairness() {
    const id=fairnessId.current++;
    fairnessWorker.current?.postMessage({type:'stop',id});
    setFairness(null);setFairnessRunning(false);setFairnessError('');
  }
  function toggleFairness() {
    if(fairnessRunning){fairnessWorker.current?.postMessage({type:'stop',id:fairnessId.current});setFairnessRunning(false);return;}
    const id=++fairnessId.current;
    setFairness(null);setFairnessError('');setFairnessRunning(true);
    fairnessWorker.current?.postMessage({type:'start',id,expression,dialect:dialectHint});
  }
  useEffect(()=>{
    if(!collapsed.history||!historyPreviewRef.current)return;
    const preview=historyPreviewRef.current;
    const measure=()=>{
      let count=0;
      for(const child of Array.from(preview.children) as HTMLElement[]){
        if(child.offsetLeft+child.offsetWidth>preview.clientWidth)break;
        count++;
      }
      setHistoryPreviewCount(count);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(preview);
    requestAnimationFrame(measure);
    return ()=>observer.disconnect();
  },[collapsed.history,history]);
  if(obr.status==='connecting')return <StatusPanel title="Connecting to Owlbear Rodeo" message="Waiting for room access…"/>;
  if(obr.status==='error')return <StatusPanel title="No Dice unavailable" message={obr.error??'Could not connect to Owlbear Rodeo'} onRetry={()=>void obr.refresh()}/>;
  const max=Math.max(0,...(chart?.entries.map(x=>x.probability)??[]));
  const chartTails=chart?inclusiveTails(chart.entries):[];
  const fairCounts=new Map(fairness?.counts.map(item=>[JSON.stringify(item.value),item.count])??[]);
  const historicCounts=new Map<string,number>();
  for(const value of chartRolls){const key=JSON.stringify(value);historicCounts.set(key,(historicCounts.get(key)??0)+1);}
  const shownFair=chart?.entries.slice(0,MAX_VISIBLE_BARS).reduce((sum,item)=>sum+(fairCounts.get(JSON.stringify(item.value))??0),0)??0;
  const {recent,older}=displayedRolls(history,rollingRequestId!==null);
  const sendPanel=(message:PanelCommand)=>{
    if(obr.roomId&&obr.playerId)panelChannel.current?.postMessage({...message,roomId:obr.roomId,playerId:obr.playerId});
  };
  const stale=detectStaleSession(session,sessionRolls,obr.role==='GM');
  const suppressionKey=`${EXTENSION_ID}/stale-dismissed/${obr.roomId??''}/${obr.playerId??''}`;
  const isSuppressed=(key:string)=>{try{return (JSON.parse(sessionStorage.getItem(suppressionKey)??'[]') as string[]).includes(key);}catch{return false;}};
  const showReminder=stale&&reminderKey(stale)!==dismissedReminder&&!isSuppressed(reminderKey(stale));
  const continueSession=()=>{if(!stale)return;const key=reminderKey(stale);setDismissedReminder(key);try{const previous=JSON.parse(sessionStorage.getItem(suppressionKey)??'[]') as string[];sessionStorage.setItem(suppressionKey,JSON.stringify([...previous.filter(item=>item!==key),key].slice(-20)));}catch{/* In-memory dismissal still works. */}};
  const selectedStart=parseLocalDateTime(sessionStart);
  const startError=sessionDialog==='new'&&session&&(!Number.isFinite(selectedStart)?'Enter a valid local Session Start time.':selectedStart<session.startedAt?'Session Start cannot be earlier than the beginning of the current session.':'');
  const preview=migrationPreview(sessionRolls,selectedStart);
  const openNewSession=(start?:number)=>{setSessionName(defaultSessionName());setSessionStart(localDateTime(new Date(start??Date.now()),true));setSessionError('');setSessionDialog('new');};
  const saveSession=async()=>{if(obr.role!=='GM'||!obr.roomId||!obr.playerId||!sessionName.trim()||!sessionDialog||startError||(sessionDialog==='new'&&!sessionRollsLoaded))return;setSessionError('');let created:DiceSession|undefined;try{const next=sessionDialog==='new'?await startSession(obr.roomId,obr.playerId,sessionName,selectedStart,preview.count):await renameSession(obr.roomId,obr.playerId,sessionName);if(sessionDialog==='new')created=next;await OBR.room.setMetadata({[SESSION_KEY]:next});setSession(next);setSessionDialog(null);setSessionRolls([]);}catch(error){if(created&&session)try{await rollbackSessionSplit(obr.roomId,obr.playerId,session,created);}catch{setSessionError('The room update failed and the local session could not be restored. Reopen No Dice to synchronize.');return;}setSessionError(error instanceof Error?error.message:'Could not save the session.');if(session)void getSessionRolls(obr.roomId,obr.playerId,session.id).then(setSessionRolls).catch(()=>{});}};
  const toggle=(section:'distribution'|'recent'|'history')=>setCollapsed(previous=>({...previous,[section]:!previous[section]}));
  const entry=(item:RollResult,isRecent=false)=><article className="entry" key={item.requestId} ref={isRecent?recentCardRef:undefined}>
    <div className="entry-meta"><strong>{item.playerName}</strong><span className="entry-meta-right"><span>{item.visibility==='everyone'?'Everyone':item.visibility==='gm'?'GM':'Self'} · {new Date(item.time).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span></span></div>
    <button type="button" className="expression-link" onClick={()=>{setExpression(item.expression);setDialectHint(item.dialect);setSelected(null);}} title="Put this expression back in the input">{item.expression}</button>
    {item.label&&<div className="entry-label">{item.label}</div>}
    <details className="work-details" open={isRecent?showWorkOpen:undefined} onToggle={isRecent?event=>{const open=event.currentTarget.open;setShowWorkOpen(open);if(obr.roomId&&obr.playerId)saveShowWork(obr.roomId,obr.playerId,open);}:undefined}><summary>Show work</summary><div className="work-rows">{ledgerWorkRows(item).map((row,i)=><div className="work-row" key={i}><span className="work-die">{row.die}</span><span className="work-expression">{row.expression}{row.drawIndices?.map(index=>{const draw=item.resolution?.dice[index];const moment=momentsByRollId.get(item.requestId)?.find(moment=>moment.type==='die-rarity'&&moment.drawIndex===index);return draw&&moment?<span key={index} className={`work-draw rarity-${moment.tier}`} title={moment.label}>{String(draw.face)}</span>:null;})}</span></div>)}</div></details>
    <ResultDisplay result={item} moments={momentsByRollId.get(item.requestId)??[]}/>
  </article>;
  return <main className="no-dice" ref={panelRef}>
    <header className="panel-title" onPointerDown={event=>{if((event.target as HTMLElement).closest('button,a'))return;dragStart.current={x:event.screenX,y:event.screenY};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerUp={event=>{const start=dragStart.current;dragStart.current=null;if(start){const dx=event.screenX-start.x,dy=event.screenY-start.y;if(Math.abs(dx)+Math.abs(dy)>5)sendPanel({type:'move',dx,dy});}}} onPointerCancel={()=>{dragStart.current=null;}}>
      <div className="header-brand"><img className="header-icon" src="./icon.svg" alt="" aria-hidden="true"/><h1>No<br/>Dice</h1><span className="version">v{RELEASE_VERSION}</span></div><div className="panel-title-actions"><button type="button" className={`header-action fairness-toggle${fairnessRunning?' running':''}`} onClick={toggleFairness} disabled={!expression.trim()} aria-label={fairnessRunning?'Stop fairness calculation':'Calculate fairness'} aria-pressed={fairnessRunning} title={fairnessRunning?'Stop fairness calculation':'Calculate fairness'}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v17M5 6h14M3 20h18M7 6l-4 8h8L7 6Zm10 0-4 8h8l-4-8Z"/></svg></button>{obr.role==='GM'&&<button type="button" className="settings-toggle header-action" aria-label="GM settings" aria-expanded={settingsOpen} title="GM settings" onClick={()=>setSettingsOpen(value=>!value)}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.7 3.4 10.3 2h3.4l.6 1.4 1.7.7 1.4-.6 2.4 2.4-.6 1.4.7 1.7 1.4.6v3.4l-1.4.6-.7 1.7.6 1.4-2.4 2.4-1.4-.6-1.7.7-.6 1.4h-3.4l-.6-1.4-1.7-.7-1.4.6-2.4-2.4.6-1.4-.7-1.7L2 13.7v-3.4l1.4-.6.7-1.7-.6-1.4 2.4-2.4 1.4.6 1.7-.7Z"/><circle cx="12" cy="12" r="3"/></svg></button>}</div>
      <div className="panel-title-actions secondary-actions"><a className="header-action help-button" aria-label="No Dice help" title="No Dice help" href="https://no-dice.ex-asperis.com" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.2 9a3 3 0 1 1 5.2 2c-1.5 1.2-2.4 1.7-2.4 3"/><circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none"/></svg></a><button type="button" className="header-action panel-close" aria-label="Close panel" title="Close panel" onClick={()=>sendPanel({type:'close'})}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    </header>
    {obr.role==='GM'&&settingsOpen&&<GMSettings settings={roomSettings} verifiableRollsAvailable={verifiableRollsAvailable}/>}
    <section className="session-strip"><span>Session: <strong>{session?.name??'Loading…'}</strong>{showReminder&&' ⚠'}</span><div><button type="button" onClick={()=>sendPanel({type:'statistics'})}>Statistics</button>{obr.role==='GM'&&<><button type="button" onClick={()=>{setSessionName(session?.name??'');setSessionDialog('rename');}}>Rename</button><button type="button" onClick={()=>openNewSession()}>New Session</button></>}</div></section>
    {showReminder&&<aside className="stale-reminder" aria-label="Session reminder"><strong>Still using "{session?.name}"?</strong><p>{stale.resumedAt?`New activity began at ${new Date(stale.resumedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} after ${Math.floor((stale.resumedAt-stale.lastOldRoll)/3600000)} hours of inactivity.`:`No rolls have been recorded for ${Math.floor((Date.now()-stale.lastOldRoll)/3600000)} hours.`}</p><div><button type="button" onClick={()=>openNewSession(stale.resumedAt||undefined)}>New Session</button><button type="button" onClick={continueSession}>Continue Session</button></div></aside>}
    {sessionDialog&&<div className="session-dialog-backdrop"><form className="session-dialog" onSubmit={event=>{event.preventDefault();void saveSession();}}><h2>{sessionDialog==='new'?'New Session':'Rename Session'}</h2><label htmlFor="session-name">Session name</label><input id="session-name" value={sessionName} onChange={event=>setSessionName(event.target.value)} autoFocus maxLength={100}/>{sessionDialog==='new'&&<><label htmlFor="session-start">Session Start</label><input id="session-start" type="datetime-local" step="0.001" value={sessionStart} onChange={event=>setSessionStart(event.target.value)}/>{startError?<p className="session-error" role="alert">{startError}</p>:!sessionRollsLoaded?<p className="session-preview">Loading current session rolls…</p>:<p className="session-preview">{preview.count===0?'Creating this session will move 0 rolls from the current session.':<>{preview.count} rolls by {preview.rollers} players will move from "{session?.name}" into the new session.<br/>First moved roll: {new Date(preview.first!).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}<br/>Last moved roll: {new Date(preview.last!).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</>}</p>}</>}{sessionError&&<p className="session-error" role="alert">{sessionError}</p>}<div><button type="button" onClick={()=>setSessionDialog(null)}>Cancel</button><button type="submit" disabled={Boolean(startError)||(sessionDialog==='new'&&!sessionRollsLoaded)}>Save</button></div></form></div>}
    <section className="probability" aria-label="Probability distribution">
      <button type="button" className="section-heading section-toggle distribution-heading" aria-expanded={!collapsed.distribution} onClick={()=>toggle('distribution')}><span className="section-label"><span className="chevron" aria-hidden="true">{collapsed.distribution?'▸':'▾'}</span><strong>Distribution</strong></span><span className="distribution-stats" aria-label={chart?`Range ${chart.range?chart.range.join(' to '):chart.entries.length+' outcomes'}, mean ${chart.mean?.toFixed(2)??'unavailable'}, standard deviation ${chart.standardDeviation?.toFixed(2)??'unavailable'}, mode ${display(chart.mode??'—')}`:'Range, mean, standard deviation, and mode unavailable'}><span>{chart?.range?`Range ${chart.range[0]}–${chart.range[1]}`:chart?`${chart.entries.length} outcomes`:'Range —'}</span><span>Mean {chart?.mean?.toFixed(2)??'—'}</span><span>SD {chart?.standardDeviation?.toFixed(2)??'—'}</span><span>Mode {chart?display(chart.mode??'—'):'—'}</span></span><span className="distribution-method">{chart?(chart.exact?'Exact':'≈ Estimated'):chartError?'Unavailable':'Enter an expression'}</span></button>
      {!collapsed.distribution&&<>
        <div className={`bars${chart ? '' : ' distribution-placeholder'}`} role={chart ? 'img' : undefined} aria-label={chart ? 'Probability mass chart with roll history and fairness overlay' : undefined} aria-hidden={chart ? undefined : true}>{chart?.entries.slice(0,MAX_VISIBLE_BARS).map((item,i)=>{const key=JSON.stringify(item.value),observed=fairCounts.get(key)??0,historic=historicCounts.get(key)??0,rate=fairness?.total?observed/fairness.total:0;const actual=selected?.expression===expression&&selected.dialect===detectedDialect&&display(selected.value)===display(item.value);return <div className={`bar-cell${actual?' actual':''}${actual&&selected.verification?.state==='verified'?' verified':''}`} key={i} title={chartBarTooltip(display(item.value),item.probability,fairnessRunning||fairness?rate:undefined,chartTails[i])}><div className="bar-pair"><div className="bar" style={{height:Math.max(3,item.probability/max*100)+'%'}}/>{fairness&&<div className="bar observed" style={{height:observed?Math.max(3,rate/max*100)+'%':'0'}}/>}</div>{historic>0&&<span className="history-mark">{historic}</span>}<small>{display(item.value)}</small></div>;})}</div>
        {fairness&&<div className="fairness-controls"><span className="fairness-legend"><i aria-hidden="true"/> Observed · {fairness.total.toLocaleString()} rolls{fairness.total>shownFair?' · '+(fairness.total-shownFair).toLocaleString()+' outside visible chart':''}</span><button type="button" className="fairness-reset" onClick={resetFairness} aria-label="Reset observed fairness results">Reset</button></div>}
        {fairnessError&&<div className="input-error" role="alert">{fairnessError}</div>}
      </>}
    </section>
    <form className={`composer${roomSettings.verifiableRollsEnabled&&verifiableRollsAvailable?' verifiable-available':''}`} onSubmit={e=>{e.preventDefault();submit();}}>
      <div className="composer-heading"><label htmlFor="expression">Expression</label>{notation&&<NotationPopover expression={expression} notation={notation}/>}</div>
      <div className="expression-row"><div className={`expression-field${expression?' has-expression':''}`}><textarea id="expression" ref={inputRef} rows={1} autoComplete="off" spellCheck={false} value={expression} onChange={e=>{currentInput.current.expression=e.target.value;setExpression(e.target.value);setDialectHint(undefined);setSelected(null);setInputError('');}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!busy&&expression.trim())submit();}}} placeholder="Enter expression" title="Enter to roll; Shift+Enter for a new line" aria-describedby={inputError||chartError?'input-error':undefined}/><button type="button" className="clear-expression" disabled={!expression} onClick={()=>{currentInput.current.expression='';setExpression('');setDialectHint(undefined);setSelected(null);setInputError('');inputRef.current?.focus();}} aria-label="Clear expression">Clear</button></div><select aria-label="Roll audience" value={visibility} onChange={e=>setVisibility(e.target.value as Visibility)}><option value="everyone">All</option><option value="self">Self</option><option value="gm">GM</option></select><button type="submit" className="roll-button" disabled={busy||!expression.trim()}>Roll</button></div>
      {inputError&&<div id="input-error" className="input-error" role="alert">{inputError}</div>}
      {!inputError&&chartError&&<div id="input-error" className="input-error" role="status">{chartError}</div>}
    </form>
    <section className="recent-section" aria-label="Most recent result">
      <button type="button" className="section-heading section-toggle" aria-expanded={!collapsed.recent} onClick={()=>toggle('recent')}><span className="section-label"><span className="chevron" aria-hidden="true">{collapsed.recent?'▸':'▾'}</span><strong>Most Recent Result</strong></span>{collapsed.recent&&recent&&<span className="collapsed-recent-result"><span className="collapsed-recent-content">{recent.verification&&<span className={`verification-preview ${recent.verification.state}`}>{recent.verification.state==='verified'?'✓':'⚠'}</span>}<span className={`collapsed-output${recent.error?' error':''}`}>{recent.error??display(recent.value)}</span><span className="collapsed-recent-player" title={recent.playerName}>({recent.playerName})</span></span></span>}</button>
      {!collapsed.recent&&(rollingRequestId?<article className="entry rolling-entry" role="status" style={rollingCardHeight?{height:rollingCardHeight,minHeight:rollingCardHeight}:undefined}>Rolling . . .</article>:recent?entry(recent,true):<div className="empty">No rolls yet.</div>)}
    </section>
    <section className="ledger" aria-label="Roll history">
      <button type="button" className="section-heading section-toggle" aria-expanded={!collapsed.history} onClick={()=>toggle('history')}><span className="section-label"><span className="chevron" aria-hidden="true">{collapsed.history?'▸':'▾'}</span><strong>History</strong></span>{collapsed.history&&<span className="collapsed-history" ref={historyPreviewRef}>{older.map((item,index)=><span className="collapsed-history-result" key={item.requestId} style={{visibility:index<historyPreviewCount?'visible':'hidden'}} aria-hidden={index>=historyPreviewCount}>{item.verification&&<span className={`verification-preview ${item.verification.state}`}>{item.verification.state==='verified'?'✓':'⚠'} </span>}{item.error??display(item.value)}</span>)}</span>}</button>
      {!collapsed.history&&(older.length?older.map(item=>entry(item)):<div className="empty">No earlier rolls.</div>)}
    </section>
  </main>;
}
