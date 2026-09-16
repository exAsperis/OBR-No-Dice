import { describe, expect, it, vi } from 'vitest';
import { rollExpression } from './rollService';
import { createNoDiceApiHandler } from './noDiceApiHandler';
import {
  isNoDiceRollRequestV1, NO_DICE_API_REQUEST, NO_DICE_API_RESPONSE,
  successResponse, type NoDiceRollRequestV1, type NoDiceRollResponseV1,
} from './noDiceApi';
import { rollWithNoDice } from './noDiceClient';

const request = (requestId: string, expression: string, options?: NoDiceRollRequestV1['options']): NoDiceRollRequestV1 =>
  ({ protocolVersion: 1, type: 'roll', requestId, expression, options });
const complete = (expression: string, requestId = 'r1', values = [0, 1, 2, 3, 4, 5], label?: string) => {
  let index = 0;
  return rollExpression({ requestId, expression, visibility: 'everyone', playerId: 'player', playerName: 'Bryan', label, source: 'external-api' },
    { integer: size => values[index++] % size });
};

describe('No Dice public API v1', () => {
  it.each([
    ['d20', 'number'], ['2d6+3', 'number'], ['p3d6', 'pool'], ['H[2d20]', 'number'],
    ['H2[3d6,d8]', 'number'], ['d{0,0,1,1}', 'number'], ['d6!', 'number'],
    ['2d6 | 6-:"Fail";7-9:"Partial success";10+:"Success"', 'text'],
  ])('uses the normal roll pipeline for %s', (expression, kind) => {
    const values = expression === 'd6!' ? [5, 1] : expression.includes('|') ? [2, 3] : [0, 1, 2, 3];
    const completed = complete(expression, 'id', values);
    const response = successResponse('id', completed);
    expect(response.result.kind).toBe(kind);
    expect(response.expression.input).toBe(expression);
    expect(response.expression.short).toBeTruthy();
    expect(response.expression.long).toBeTruthy();
    expect(response.display).toBeTruthy();
    expect(response.requestId).toBe('id');
    if (expression.includes('|')) {
      expect(response.result).toEqual({ kind: 'text', value: 'Partial success' });
      expect(response.display).toBe('7 · Partial success');
      expect(completed.record.value).toBe(7);
    }
    if (expression === 'p3d6') expect(response.result).toEqual({ kind: 'pool', values: [1, 2, 3] });
  });

  it('validates requests and returns structured failures without rolling', async () => {
    const responses: NoDiceRollResponseV1[] = [];
    const roll = vi.fn((expression: string, id: string) => complete(expression, id));
    const handle = createNoDiceApiHandler({ roll, record: async () => {}, respond: async response => { responses.push(response); } });
    expect(isNoDiceRollRequestV1(request('x', 'd6'))).toBe(true);
    await handle({ ...request('version', 'd6'), protocolVersion: 2 });
    await handle({ ...request('missing', 'd6'), expression: '' });
    await handle({ ...request('syntax', 'd6+'), options: { record: false } });
    await handle(request('semantic', 'H3[2d8]'));
    await handle({ ...request('', 'd6') });
    expect(responses.map(response => response.ok ? 'OK' : response.error.code)).toEqual([
      'UNSUPPORTED_VERSION', 'INVALID_REQUEST', 'PARSE_ERROR', 'VALIDATION_ERROR',
    ]);
    expect((responses[3] as Extract<NoDiceRollResponseV1, { ok: false }>).error.start).toBeTypeOf('number');
    expect(roll).toHaveBeenCalledTimes(2);
  });

  it('records by default, skips recording when asked, preserves labels, and rolls a repeated ID once', async () => {
    const responses: NoDiceRollResponseV1[] = [];
    const recorded: string[] = [];
    const roll = vi.fn((expression: string, id: string, label?: string) => complete(expression, id, [0], label));
    const handle = createNoDiceApiHandler({
      roll,
      record: async completed => { recorded.push(completed.record.requestId); },
      respond: async response => { responses.push(response); },
    });
    await Promise.all([handle(request('same', 'd20', { label: '<b>Attack</b>' })), handle(request('same', 'd20'))]);
    await handle(request('silent', 'd20', { record: false }));
    expect(roll).toHaveBeenCalledTimes(2);
    expect(recorded).toEqual(['same']);
    expect(responses.map(response => response.requestId)).toEqual(['same', 'same', 'silent']);
    expect(roll.mock.results[0].value.record.label).toBe('<b>Attack</b>');
  });

  it('returns separate responses for simultaneous distinct requests', async () => {
    const responses: NoDiceRollResponseV1[] = [];
    const roll = vi.fn(async (expression: string, id: string) => {
      await Promise.resolve();
      return complete(expression, id, [0]);
    });
    const handle = createNoDiceApiHandler({ roll, record: async () => {}, respond: async response => { responses.push(response); } });
    await Promise.all([handle(request('first', 'd20')), handle(request('second', 'd6'))]);
    expect(roll).toHaveBeenCalledTimes(2);
    expect(new Set(responses.map(response => response.requestId))).toEqual(new Set(['first', 'second']));
    expect(responses.every(response => response.ok)).toBe(true);
  });

  it('rejects oversized response data before recording or broadcasting a roll', async () => {
    const responses: NoDiceRollResponseV1[] = [];
    const record = vi.fn(async () => {});
    const handle = createNoDiceApiHandler({
      roll: (expression, id) => {
        const completed = complete(expression, id, [0]);
        completed.record.value = 'x'.repeat(13_000);
        completed.display = 'x'.repeat(13_000);
        return completed;
      },
      record,
      respond: async response => { responses.push(response); },
    });
    await handle(request('large', 'd1'));
    expect(responses[0]).toMatchObject({ ok: false, error: { code: 'EVALUATION_ERROR' } });
    expect(record).not.toHaveBeenCalled();
  });

  it('keeps simultaneous request responses correlated and ignores unrelated IDs in the client helper', async () => {
    const ids = ['first', 'second'];
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => ids.shift()! });
    const listeners = new Set<(event: { data: unknown; connectionId: string }) => void>();
    const sent: NoDiceRollRequestV1[] = [];
    const broadcast = {
      onMessage: vi.fn((channel: string, listener: (event: { data: unknown; connectionId: string }) => void) => {
        expect(channel).toBe(NO_DICE_API_RESPONSE);
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      }),
      sendMessage: vi.fn(async (channel: string, data: unknown, options: { destination: string }) => {
        expect(channel).toBe(NO_DICE_API_REQUEST);
        expect(options.destination).toBe('LOCAL');
        expect(listeners.size).toBe(sent.length + 1);
        sent.push(data as NoDiceRollRequestV1);
      }),
    };
    try {
      const first = rollWithNoDice('d20', undefined, broadcast as never);
      const second = rollWithNoDice('2d6', { record: false }, broadcast as never);
      const dispatch = (response: NoDiceRollResponseV1) => [...listeners].forEach(listener => listener({ data: response, connectionId: 'local' }));
      dispatch(successResponse('unrelated', complete('d20', 'unrelated')));
      expect(listeners.size).toBe(2);
      dispatch(successResponse('second', complete('2d6', 'second')));
      dispatch(successResponse('first', complete('d20', 'first')));
      expect((await first).requestId).toBe('first');
      expect((await second).requestId).toBe('second');
      expect(sent.map(item => item.requestId)).toEqual(['first', 'second']);
      expect(listeners.size).toBe(0);
    } finally { Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: original }); }
  });
});
