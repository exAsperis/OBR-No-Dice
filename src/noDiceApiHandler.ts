import {
  errorResponse, isNoDiceRollRequestV1, MAX_API_BROADCAST_BYTES, rollErrorResponse, successResponse, usableRequestId,
  type NoDiceRollResponseV1,
} from './noDiceApi';
import type { CompletedRoll } from './rollService';

export interface ApiHandlerDependencies {
  roll(expression: string, requestId: string, label?: string): CompletedRoll | Promise<CompletedRoll>;
  record(completed: CompletedRoll): Promise<void>;
  respond(response: NoDiceRollResponseV1): Promise<void>;
}

/** One background-owned handler; duplicate request IDs share a single roll. */
export function createNoDiceApiHandler(dependencies: ApiHandlerDependencies) {
  const pending = new Map<string, Promise<NoDiceRollResponseV1>>();
  return async (data: unknown): Promise<void> => {
    const requestId = usableRequestId(data);
    if (requestId === null) return;
    let response = pending.get(requestId);
    if (!response) {
      response = (async (): Promise<NoDiceRollResponseV1> => {
        if (typeof data === 'object' && data !== null && 'protocolVersion' in data && data.protocolVersion !== 1)
          return errorResponse(requestId, 'UNSUPPORTED_VERSION', 'No Dice API protocol version 1 is required');
        if (!isNoDiceRollRequestV1(data))
          return errorResponse(requestId, 'INVALID_REQUEST', 'Expected a roll request with a non-empty expression of at most 1,000 characters');
        try {
          const completed = await dependencies.roll(data.expression, requestId, data.options?.label);
          const success = successResponse(requestId, completed);
          if (new TextEncoder().encode(JSON.stringify(success)).length > MAX_API_BROADCAST_BYTES)
            throw new Error('Roll result is too large for an Owlbear broadcast');
          if (data.options?.record !== false) await dependencies.record(completed);
          return success;
        } catch (error) { return rollErrorResponse(requestId, error); }
      })();
      pending.set(requestId, response);
      if (pending.size > 200) pending.delete(pending.keys().next().value!);
    }
    try { await dependencies.respond(await response); }
    catch { /* The caller times out if its local response cannot be delivered. */ }
  };
}
