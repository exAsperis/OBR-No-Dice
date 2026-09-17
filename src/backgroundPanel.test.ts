import { describe, expect, it, vi } from 'vitest';
import { PANEL_CHANNEL } from './panelProtocol';

const state = vi.hoisted(() => ({
  opened: [] as Array<Record<string, unknown>>,
  closed: [] as string[],
  resized: [] as number[],
  width: 1200,
  height: 800,
}));
vi.mock('@owlbear-rodeo/sdk', () => ({ default: {
  onReady: (callback: () => Promise<void>) => { void callback(); },
  room: { id: 'room' }, player: { id: 'player', getRole: async () => 'PLAYER', getName: async () => 'Player' },
  viewport: { getWidth: async () => state.width, getHeight: async () => state.height },
  popover: { open: async (value: Record<string, unknown>) => { state.opened.push(value); }, close: async (id: string) => { state.closed.push(id); }, setHeight: async (_id: string, height: number) => { state.resized.push(height); } },
  broadcast: { onMessage: () => () => {}, sendMessage: async () => {} },
} }));

describe('background main panel', () => {
  it('delivers shortcuts to a closed and open panel and re-centers offscreen saved placement', async () => {
    class LocalChannel {
      static instances: LocalChannel[] = [];
      onmessage: ((event: { data: unknown }) => void) | null = null;
      sent: unknown[] = [];
      constructor(readonly name: string) { LocalChannel.instances.push(this); }
      postMessage(message: unknown) { this.sent.push(message); }
    }
    vi.stubGlobal('BroadcastChannel', LocalChannel);
    await import('./background');
    const panel = LocalChannel.instances.find(channel => channel.name === PANEL_CHANNEL)!;
    const send = (message: object) => panel.onmessage?.({ data: { roomId: 'room', playerId: 'player', ...message } });
    send({ type: 'shortcut', term: 'd6' });
    await vi.waitFor(() => expect(state.opened).toHaveLength(1));
    send({ type: 'ready' });
    expect(panel.sent).toContainEqual(expect.objectContaining({ type: 'apply-shortcut', term: 'd6' }));
    send({ type: 'shortcut', term: 'd8' });
    expect(panel.sent).toContainEqual(expect.objectContaining({ type: 'apply-shortcut', term: 'd8' }));
    send({ type: 'resize', height: 250 });
    await vi.waitFor(() => expect(state.resized).toContain(250));
    send({ type: 'move', dx: 900, dy: 0 });
    await vi.waitFor(() => expect(state.opened).toHaveLength(2));
    expect(state.opened[1].anchorPosition).toEqual({ left: 380, top: 275 });
    expect(state.opened[1].height).toBe(250);
    send({ type: 'resize', height: 600 });
    await vi.waitFor(() => expect(state.opened).toHaveLength(3));
    expect(state.opened[2].anchorPosition).toEqual({ left: 380, top: 100 });
    expect(state.opened[2].height).toBe(600);
    vi.unstubAllGlobals();
  });
});
