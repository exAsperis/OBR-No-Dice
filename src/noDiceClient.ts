import OBR from '@owlbear-rodeo/sdk';
import {
  isNoDiceRollResponseV1, NO_DICE_API_REQUEST, NO_DICE_API_RESPONSE,
  type NoDiceRollRequestV1, type NoDiceRollSuccessV1,
} from './noDiceApi';

type Broadcast = Pick<typeof OBR.broadcast, 'onMessage' | 'sendMessage'>;

/** Copyable caller helper. Subscribe before sending; always unsubscribe. */
export function rollWithNoDice(
  expression: string,
  options?: NoDiceRollRequestV1['options'],
  broadcast: Broadcast = OBR.broadcast,
  timeoutMs = 3000,
): Promise<NoDiceRollSuccessV1> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      action();
    };
    unsubscribe = broadcast.onMessage(NO_DICE_API_RESPONSE, event => {
      const response = event.data;
      if (!isNoDiceRollResponseV1(response) || response.requestId !== requestId) return;
      finish(() => response.ok ? resolve(response) : reject(new Error(response.error.message)));
    });
    timer = setTimeout(() => finish(() => reject(new Error('No Dice did not respond'))), timeoutMs);
    const request: NoDiceRollRequestV1 = { protocolVersion: 1, type: 'roll', requestId, expression, options };
    void broadcast.sendMessage(NO_DICE_API_REQUEST, request, { destination: 'LOCAL' })
      .catch(error => finish(() => reject(error)));
  });
}
