import OBR from '@owlbear-rodeo/sdk';
import { decryptForGm, encryptForGm, publishGmKey } from './gmCrypto';
import { GM_CHANNEL, isResult, RESULT_CHANNEL, type EncryptedResult, type RollResult } from './protocol';
import { isLocalMessage, LOCAL_CHANNEL, REVEAL_POPOVER_ID, type LocalMessage } from './revealProtocol';
import { MAX_API_BROADCAST_BYTES, NO_DICE_API_REQUEST, NO_DICE_API_RESPONSE } from './noDiceApi';
import { createNoDiceApiHandler } from './noDiceApiHandler';
import { rollExpression } from './rollService';
import { appendRoll, LEDGER_CHANNEL, makeSession, migrateHistory, readSharedSession, SESSION_KEY } from './sessionLedger';
import { EXTENSION_ID } from './constants';
import { PANEL_CHANNEL, PANEL_POPOVER_ID, isPanelMessage, type PanelMessage } from './panelProtocol';
import { clearDraft, fittedPosition, loadHeight, loadPosition, saveHeight, savePosition, type PanelPosition } from './panelLayout';
import { RELEASE_VERSION } from './version';
import { fittedRevealPosition, loadRevealPosition, saveRevealPosition } from './revealLayout';
import { VerificationClient } from './verification';
import { VERIFY_LOCAL_CHANNEL, type VerificationLocalMessage } from './verificationBridge';

OBR.onReady(async () => {
  const roomId = OBR.room.id;
  const playerId = OBR.player.id;
  const role = await OBR.player.getRole();
  const sharedSession=async()=>{try{return readSharedSession(await OBR.room.getMetadata());}catch{return undefined;}};
  const initialSession=await sharedSession();
  if(role==='GM'&&!initialSession)await OBR.room.setMetadata({[SESSION_KEY]:makeSession()}).catch(()=>{});
  const migration=migrateHistory(roomId,playerId,await sharedSession()).catch(()=>{});
  const verificationChannel=new BroadcastChannel(VERIFY_LOCAL_CHANNEL);
  const verifier=new VerificationClient(roomId,playerId,role,()=>verificationChannel.postMessage({type:'status',roomId,playerId,available:verifier.available} satisfies VerificationLocalMessage));
  void verifier.start().catch(()=>{});
  verificationChannel.onmessage=(event:MessageEvent<VerificationLocalMessage>)=>{
    const message=event.data;
    if(!message||message.roomId!==roomId||message.playerId!==playerId)return;
    if(message.type==='status-request')verificationChannel.postMessage({type:'status',roomId,playerId,available:verifier.available} satisfies VerificationLocalMessage);
    if(message.type==='roll')void verifier.roll(message.input).then(result=>verificationChannel.postMessage({type:'roll-response',roomId,playerId,requestId:message.requestId,verification:result.verification} satisfies VerificationLocalMessage)).catch(()=>verificationChannel.postMessage({type:'roll-response',roomId,playerId,requestId:message.requestId} satisfies VerificationLocalMessage));
  };
  const local = new BroadcastChannel(LOCAL_CHANNEL);
  const ledgerEvents = new BroadcastChannel(LEDGER_CHANNEL);
  const seen = new Set<string>();
  let current: RollResult | null = null;
  let popoverOpen = false;
  let opening = false;
  let gmKey: CryptoKey | null = null;
  let rerolling = false;
  let revealPosition: PanelPosition | null = loadRevealPosition(playerId);
  let revealResume: { visibleCount: number; highlighted: boolean; dismissDeadline?: number } | null = null;
  const panelChannel = new BroadcastChannel(PANEL_CHANNEL);
  const statisticsId=`${EXTENSION_ID}/statistics`;
  let panelOpen = false;
  let panelOpening = false;
  let closeAfterOpening = false;
  let panelClosePromise: Promise<void> | null = null;
  let panelPosition: PanelPosition | null = null;
  const pendingShortcuts: Array<{ term: string; requestId: string }> = [];
  const panelSize = { width: 440, height: 650 };
  let desiredPanelHeight = loadHeight(playerId);
  let openedPanelHeight = 0;
  const sendPanelState = (open: boolean) => panelChannel.postMessage({ type: 'state', roomId, playerId, open } satisfies PanelMessage);
  const panelBounds = async () => {
    const [width, height] = await Promise.all([
      OBR.viewport.getWidth().catch(() => window.screen.availWidth),
      OBR.viewport.getHeight().catch(() => window.screen.availHeight),
    ]);
    return { width: width > 0 ? width : window.screen.availWidth, height: height > 0 ? height : window.screen.availHeight };
  };
  const openPanel = async (force = false) => {
    if (panelOpening || (panelOpen && !force)) return;
    panelOpening = true;
    try {
      if (panelClosePromise) await panelClosePromise;
      if (!force) clearDraft(roomId, playerId);
      const bounds = await panelBounds();
      const size = { width: Math.min(panelSize.width, Math.max(280, bounds.width - 16)), height: Math.min(desiredPanelHeight, panelSize.height, Math.max(180, bounds.height - 16)) };
      const saved = panelPosition ?? loadPosition(playerId);
      const position = fittedPosition(saved, bounds, size);
      panelPosition = position;
      savePosition(playerId, position);
      if (force && panelOpen) await OBR.popover.close(PANEL_POPOVER_ID);
      await OBR.popover.open({
        id: PANEL_POPOVER_ID,
        url: new URL(`./panel.html?v=${RELEASE_VERSION}${force ? '&resume=1' : ''}`, window.location.href).toString(),
        width: size.width, height: size.height,
        anchorReference: 'POSITION', anchorPosition: position,
        anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
        transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
        hidePaper: true,
        disableClickAway: true, marginThreshold: 8,
      });
      panelOpen = true;
      openedPanelHeight = size.height;
    } catch (error) { panelOpen = false; console.error('No Dice panel could not open', error); }
    finally {
      panelOpening = false;
      if (closeAfterOpening) { closeAfterOpening = false; void closePanel(); }
      else if (panelOpen) { sendPanelState(true); void adjustPanelHeight(); }
    }
  };
  const closePanel = async () => {
    if (panelOpening) { closeAfterOpening = true; sendPanelState(false); return; }
    if (panelClosePromise) return panelClosePromise;
    panelOpen = false;
    pendingShortcuts.length = 0;
    sendPanelState(false);
    panelClosePromise = OBR.popover.close(PANEL_POPOVER_ID)
      .catch(error => { console.error('No Dice panel could not close', error); })
      .then(() => clearDraft(roomId, playerId))
      .finally(() => { panelClosePromise = null; });
    return panelClosePromise;
  };
  const adjustPanelHeight = async () => {
    if (!panelOpen || panelOpening) return;
    try {
      const bounds = await panelBounds();
      const height = Math.min(desiredPanelHeight, panelSize.height, Math.max(180, bounds.height - 16));
      if (Math.abs(height - openedPanelHeight) < 2) return;
      const width = Math.min(panelSize.width, Math.max(280, bounds.width - 16));
      const fitted = fittedPosition(panelPosition, bounds, { width, height });
      if (fitted.left !== panelPosition?.left || fitted.top !== panelPosition?.top) {
        panelPosition = fitted;
        await openPanel(true);
      } else {
        await OBR.popover.setHeight(PANEL_POPOVER_ID, height);
        openedPanelHeight = height;
      }
    } catch (error) { console.error('No Dice panel could not resize', error); }
  };
  panelChannel.onmessage = (event: MessageEvent<unknown>) => {
    if (!isPanelMessage(event.data)) return;
    const message = event.data;
    if (message.roomId !== roomId || message.playerId !== playerId) return;
    if (message.type === 'open') { void openPanel(); return; }
    if (message.type === 'statistics') { void (async()=>{const bounds=await panelBounds();await OBR.popover.open({id:statisticsId,url:new URL(`./statistics.html?v=${RELEASE_VERSION}`,window.location.href).toString(),width:Math.min(620,Math.max(320,bounds.width-24)),height:Math.min(700,Math.max(300,bounds.height-24)),anchorReference:'POSITION',anchorPosition:{left:Math.max(8,Math.round((bounds.width-Math.min(620,bounds.width-24))/2)),top:Math.max(8,Math.round((bounds.height-Math.min(700,bounds.height-24))/2))},anchorOrigin:{horizontal:'LEFT',vertical:'TOP'},transformOrigin:{horizontal:'LEFT',vertical:'TOP'},hidePaper:true,disableClickAway:true,marginThreshold:8});})().catch(()=>{});return; }
    if (message.type === 'toggle') { if (panelOpen || panelOpening) void closePanel(); else void openPanel(); return; }
    if (message.type === 'state-request') { sendPanelState(panelOpen && !closeAfterOpening); return; }
    if (message.type === 'shortcut') {
      if (panelOpen && !panelOpening) {
        panelChannel.postMessage({ type: 'apply-shortcut', roomId, playerId, term: message.term, requestId: message.requestId } satisfies PanelMessage);
      } else {
        pendingShortcuts.push({ term: message.term, requestId: message.requestId });
        void openPanel();
      }
      return;
    }
    if (message.type === 'ready') {
      if (pendingShortcuts.length) {
        for (const shortcut of pendingShortcuts.splice(0)) panelChannel.postMessage({ type: 'apply-shortcut', roomId, playerId, ...shortcut } satisfies PanelMessage);
      } else panelChannel.postMessage({ type: 'focus', roomId, playerId } satisfies PanelMessage);
      return;
    }
    if (message.type === 'close') {
      void closePanel();
      return;
    }
    if (message.type === 'move') {
      panelPosition = { left: (panelPosition?.left ?? 0) + message.dx, top: (panelPosition?.top ?? 0) + message.dy };
      void openPanel(true);
    }
    if (message.type === 'resize') {
      desiredPanelHeight = Math.max(180, Math.min(2000, Math.ceil(message.height)));
      saveHeight(playerId, desiredPanelHeight);
      void adjustPanelHeight();
    }
  };

  if (role === 'GM') {
    try { gmKey = await publishGmKey(); }
    catch (error) { console.error('No Dice GM key initialization failed', error); }
  }

  const send = (message: LocalMessage) => local.postMessage(message);
  const revealSize = (bounds: { width: number; height: number }) => ({
    width: Math.min(390, Math.max(280, bounds.width - 32)),
    height: Math.min(360, Math.max(220, bounds.height - 32)),
  });
  const open = async (force = false) => {
    if (opening || (popoverOpen && !force)) return;
    opening = true;
    try {
      const bounds = await panelBounds();
      const size = revealSize(bounds);
      revealPosition = fittedRevealPosition(revealPosition, bounds, size);
      saveRevealPosition(playerId, revealPosition);
      if (force && popoverOpen) await OBR.popover.close(REVEAL_POPOVER_ID);
      await OBR.popover.open({
        id: REVEAL_POPOVER_ID,
        url: new URL(`./reveal.html?v=${RELEASE_VERSION}`, window.location.href).toString(),
        width: size.width,
        height: size.height,
        anchorReference: 'POSITION',
        anchorPosition: revealPosition,
        anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
        transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' },
        hidePaper: true,
        disableClickAway: true,
        marginThreshold: 8,
      });
      popoverOpen = true;
    } catch (error) { popoverOpen = false; console.error('No Dice roll reveal could not open', error); }
    finally { opening = false; }
  };
  const ensureRevealOnScreen = async () => {
    if (!popoverOpen || opening) return;
    try {
      const bounds = await panelBounds();
      const fitted = fittedRevealPosition(revealPosition, bounds, revealSize(bounds));
      if (fitted.left !== revealPosition?.left || fitted.top !== revealPosition?.top) {
        revealPosition = fitted;
        await open(true);
      }
    } catch { /* Retry on the next bounds check. */ }
  };
  window.addEventListener('resize', () => { void ensureRevealOnScreen(); });
  window.setInterval(() => { void ensureRevealOnScreen(); }, 5_000);
  const present = (result: RollResult) => {
    if (seen.has(result.requestId)) return;
    seen.add(result.requestId);
    if (seen.size > 200) seen.delete(seen.values().next().value!);
    current = result;
    revealResume = null;
    if (popoverOpen) {
      send({ type: 'show', roomId, playerId, result });
      void ensureRevealOnScreen();
    }
    else void open();
  };

  local.onmessage = (event: MessageEvent<unknown>) => {
    if (!isLocalMessage(event.data)) return;
    const message = event.data;
    if (message.roomId !== roomId || message.playerId !== playerId) return;
    if (message.type === 'result' && isResult(message.result)) present(message.result);
    if (message.type === 'ready' && current) {
      send({ type: 'show', roomId, playerId, result: current, resume: revealResume ?? undefined });
      revealResume = null;
    }
    if (message.type === 'revealed' && isResult(message.result)) {
      void migration.then(async()=>{await appendRoll(roomId,playerId,message.result,await sharedSession());ledgerEvents.postMessage({roomId,playerId});}).catch(()=>{});
    }
    if (message.type === 'dismiss') {
      current = null;
      popoverOpen = false;
      void OBR.popover.close(REVEAL_POPOVER_ID);
    }
    if (message.type === 'move' && current && Number.isFinite(message.dx) && Number.isFinite(message.dy)) {
      revealResume = Number.isFinite(message.visibleCount)
        ? { visibleCount: message.visibleCount, highlighted: message.highlighted === true, dismissDeadline: Number.isFinite(message.dismissDeadline) ? message.dismissDeadline : undefined }
        : null;
      revealPosition = { left: (revealPosition?.left ?? 0) + message.dx, top: (revealPosition?.top ?? 0) + message.dy };
      void open(true);
    }
    if (message.type === 'reroll' && current?.requestId === message.requestId && !rerolling) {
      const original = current;
      rerolling = true;
      void (async () => {
        try {
          const { record } = rollExpression({
            requestId: crypto.randomUUID(), expression: original.expression, dialect: original.dialect,
            visibility: original.visibility, playerId, playerName: await OBR.player.getName(),
            label: original.label,
          });
          if (record.visibility === 'everyone') await OBR.broadcast.sendMessage(RESULT_CHANNEL, record);
          if (record.visibility === 'gm' && role !== 'GM') await OBR.broadcast.sendMessage(GM_CHANNEL, await encryptForGm(record));
          present(record);
        } catch (error) {
          send({ type: 'reroll-error', roomId, playerId, message: error instanceof Error ? error.message : 'Reroll failed' });
        } finally { rerolling = false; }
      })();
    }
  };

  OBR.broadcast.onMessage(RESULT_CHANNEL, event => {
    if (isResult(event.data) && event.data.visibility === 'everyone') present(event.data);
  });
  OBR.broadcast.onMessage(GM_CHANNEL, event => {
    if (role !== 'GM' || !gmKey) return;
    const payload = event.data as EncryptedResult;
    if (payload?.version !== 1 || typeof payload.ciphertext !== 'string') return;
    void decryptForGm(payload, gmKey).then(result => {
      if (!isResult(result) || result.visibility !== 'gm') return;
      if (!popoverOpen) send({ type: 'show', roomId, playerId, result });
      present(result);
    }).catch(() => {});
  });
  const handleApiRequest = createNoDiceApiHandler({
    roll: async (expression, requestId, label) => rollExpression({
      requestId, expression, visibility: 'everyone', playerId,
      playerName: await OBR.player.getName(), label, source: 'external-api',
    }),
    record: async completed => {
      const record = { ...completed.record, trace: [...completed.record.trace], steps: [...(completed.record.steps ?? [])] };
      const size = () => new TextEncoder().encode(JSON.stringify(record)).length;
      while (size() > MAX_API_BROADCAST_BYTES && (record.trace.length || record.steps.length)) {
        if (record.trace.length >= record.steps.length) record.trace.pop();
        else record.steps.pop();
      }
      if (size() > MAX_API_BROADCAST_BYTES) throw new Error('Roll record is too large for an Owlbear broadcast');
      await OBR.broadcast.sendMessage(RESULT_CHANNEL, record, { destination: 'ALL' });
      present(record);
    },
    respond: response => OBR.broadcast.sendMessage(NO_DICE_API_RESPONSE, response, { destination: 'LOCAL' }),
  });
  OBR.broadcast.onMessage(NO_DICE_API_REQUEST, event => { void handleApiRequest(event.data); });
});
