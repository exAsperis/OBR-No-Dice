import { describe, expect, it, vi } from 'vitest';
import { NO_DICE_API_REQUEST, NO_DICE_API_RESPONSE } from './noDiceApi';
import { RESULT_CHANNEL } from './protocol';
import { loadHistory } from './persistence';

const state = vi.hoisted(() => ({
  listeners: new Map<string, Array<(event: { data: unknown; connectionId: string }) => void>>(),
  sent: [] as Array<{ channel: string; data: unknown; options: unknown }>,
}));
vi.mock('@owlbear-rodeo/sdk', () => ({ default: {
  onReady: (callback: () => Promise<void>) => { void callback(); },
  room: { id: 'room' }, player: { id: 'player', getRole: async () => 'PLAYER', getName: async () => 'Bryan' },
  broadcast: {
    onMessage: (channel: string, callback: (event: { data: unknown; connectionId: string }) => void) => {
      state.listeners.set(channel, [...(state.listeners.get(channel) ?? []), callback]);
      return () => {};
    },
    sendMessage: async (channel: string, data: unknown, options: unknown) => { state.sent.push({ channel, data, options }); },
  },
} }));

describe('background API registration', () => {
  it('responds to LOCAL requests with the action popover closed and registers once', async () => {
    class LocalChannel { onmessage: unknown; constructor(_name: string) {} postMessage(_message: unknown) {} }
    vi.stubGlobal('BroadcastChannel', LocalChannel);
    await import('./background');
    await vi.waitFor(() => expect(state.listeners.get(NO_DICE_API_REQUEST)).toHaveLength(1));
    const listener = state.listeners.get(NO_DICE_API_REQUEST)![0];
    listener({ data: { protocolVersion: 1, type: 'roll', requestId: 'background', expression: 'd1', options: { record: false } }, connectionId: 'local' });
    await vi.waitFor(() => expect(state.sent.some(item => item.channel === NO_DICE_API_RESPONSE)).toBe(true));
    const response = state.sent.find(item => item.channel === NO_DICE_API_RESPONSE)!;
    expect(response.options).toEqual({ destination: 'LOCAL' });
    expect(response.data).toMatchObject({ ok: true, requestId: 'background', result: { kind: 'number', value: 1 } });
    expect(state.sent).toHaveLength(1);
    listener({ data: { protocolVersion: 1, type: 'roll', requestId: 'recorded', expression: 'd1' }, connectionId: 'local' });
    await vi.waitFor(() => expect(state.sent.filter(item => item.channel === NO_DICE_API_RESPONSE)).toHaveLength(2));
    expect(state.sent.find(item => item.channel === RESULT_CHANNEL)).toMatchObject({ options: { destination: 'ALL' } });
    expect(loadHistory('room', 'player').map(item => item.requestId)).toContain('recorded');
    vi.unstubAllGlobals();
  });
});
