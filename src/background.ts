import OBR from '@owlbear-rodeo/sdk';
import { decryptForGm, publishGmKey } from './gmCrypto';
import { GM_CHANNEL, isResult, RESULT_CHANNEL, type EncryptedResult, type RollResult } from './protocol';
import { isLocalMessage, LOCAL_CHANNEL, REVEAL_POPOVER_ID, type LocalMessage } from './revealProtocol';
import { MAX_API_BROADCAST_BYTES, NO_DICE_API_REQUEST, NO_DICE_API_RESPONSE } from './noDiceApi';
import { createNoDiceApiHandler } from './noDiceApiHandler';
import { rollExpression } from './rollService';
import { appendHistory } from './persistence';

OBR.onReady(async () => {
  const roomId = OBR.room.id;
  const playerId = OBR.player.id;
  const role = await OBR.player.getRole();
  const local = new BroadcastChannel(LOCAL_CHANNEL);
  const seen = new Set<string>();
  let current: RollResult | null = null;
  let popoverOpen = false;
  let opening = false;
  let gmKey: CryptoKey | null = null;

  if (role === 'GM') {
    try { gmKey = await publishGmKey(); }
    catch (error) { console.error('No Dice GM key initialization failed', error); }
  }

  const send = (message: LocalMessage) => local.postMessage(message);
  const open = async () => {
    if (popoverOpen || opening) return;
    opening = true;
    try {
      const [measuredWidth, measuredHeight] = await Promise.all([
        OBR.viewport.getWidth().catch(() => window.screen.availWidth),
        OBR.viewport.getHeight().catch(() => window.screen.availHeight),
      ]);
      const width = measuredWidth > 0 ? measuredWidth : window.screen.availWidth;
      const height = measuredHeight > 0 ? measuredHeight : window.screen.availHeight;
      await OBR.popover.open({
        id: REVEAL_POPOVER_ID,
        url: new URL('./reveal.html', window.location.href).toString(),
        width: Math.min(390, Math.max(280, width - 32)),
        height: Math.min(360, Math.max(220, height - 32)),
        anchorReference: 'POSITION',
        anchorPosition: { left: width - 16, top: height - 16 },
        anchorOrigin: { horizontal: 'RIGHT', vertical: 'BOTTOM' },
        transformOrigin: { horizontal: 'RIGHT', vertical: 'BOTTOM' },
        disableClickAway: true,
        marginThreshold: 8,
      });
      popoverOpen = true;
    } catch (error) { console.error('No Dice roll reveal could not open', error); }
    finally { opening = false; }
  };
  const present = (result: RollResult) => {
    if (seen.has(result.requestId)) return;
    seen.add(result.requestId);
    if (seen.size > 200) seen.delete(seen.values().next().value!);
    current = result;
    if (popoverOpen) send({ type: 'show', roomId, playerId, result });
    else void open();
  };

  local.onmessage = (event: MessageEvent<unknown>) => {
    if (!isLocalMessage(event.data)) return;
    const message = event.data;
    if (message.roomId !== roomId || message.playerId !== playerId) return;
    if (message.type === 'result' && isResult(message.result)) present(message.result);
    if (message.type === 'ready' && current) send({ type: 'show', roomId, playerId, result: current });
    if (message.type === 'dismiss') {
      current = null;
      popoverOpen = false;
      void OBR.popover.close(REVEAL_POPOVER_ID);
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
      appendHistory(roomId, playerId, record);
      await OBR.broadcast.sendMessage(RESULT_CHANNEL, record, { destination: 'ALL' });
    },
    respond: response => OBR.broadcast.sendMessage(NO_DICE_API_RESPONSE, response, { destination: 'LOCAL' }),
  });
  OBR.broadcast.onMessage(NO_DICE_API_REQUEST, event => { void handleApiRequest(event.data); });
});
