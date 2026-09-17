import { describe, expect, it, vi } from 'vitest';
import { PANEL_CHANNEL } from './panelProtocol';
import { LOCAL_CHANNEL } from './revealProtocol';
import { loadRevealPosition } from './revealLayout';
import { loadDraft, saveDraft } from './panelLayout';

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
    saveDraft('room', 'player', 'stale expression');
    await import('./background');
    const panel = LocalChannel.instances.find(channel => channel.name === PANEL_CHANNEL)!;
    const send = (message: object) => panel.onmessage?.({ data: { roomId: 'room', playerId: 'player', ...message } });
    send({ type: 'shortcut', term: 'd6', requestId: 'click-1' });
    await vi.waitFor(() => expect(state.opened).toHaveLength(1));
    expect(state.opened[0].hidePaper).toBe(true);
    expect(state.opened[0].url).not.toContain('resume=1');
    expect(loadDraft('room', 'player')).toBeNull();
    send({ type: 'ready' });
    expect(panel.sent).toContainEqual(expect.objectContaining({ type: 'apply-shortcut', term: 'd6', requestId: 'click-1' }));
    send({ type: 'shortcut', term: 'd8', requestId: 'click-2' });
    expect(panel.sent).toContainEqual(expect.objectContaining({ type: 'apply-shortcut', term: 'd8', requestId: 'click-2' }));
    send({ type: 'state-request' });
    expect(panel.sent).toContainEqual(expect.objectContaining({ type: 'state', open: true }));
    send({ type: 'resize', height: 250 });
    await vi.waitFor(() => expect(state.resized).toContain(250));
    saveDraft('room', 'player', 'd6 + d8');
    send({ type: 'move', dx: 900, dy: 0 });
    await vi.waitFor(() => expect(state.opened).toHaveLength(2));
    expect(state.opened[1].anchorPosition).toEqual({ left: 380, top: 275 });
    expect(state.opened[1].height).toBe(250);
    expect(state.opened[1].url).toContain('resume=1');
    expect(loadDraft('room', 'player')).toBe('d6 + d8');
    send({ type: 'resize', height: 600 });
    await vi.waitFor(() => expect(state.opened).toHaveLength(3));
    expect(state.opened[2].anchorPosition).toEqual({ left: 380, top: 100 });
    expect(state.opened[2].height).toBe(600);
    const reveal = LocalChannel.instances.find(channel => channel.name === LOCAL_CHANNEL)!;
    reveal.onmessage?.({ data: { type: 'result', roomId: 'room', playerId: 'player', result: { version: 1, requestId: 'glass', expression: 'd1', dialect: 'nodice', visibility: 'self', playerId: 'player', playerName: 'Player', value: 1, trace: [], time: 1 } } });
    await vi.waitFor(() => expect(state.opened).toHaveLength(4));
    expect(state.opened[3].hidePaper).toBe(true);
    expect(state.opened[3].anchorPosition).toEqual({ left: 794, top: 424 });
    reveal.onmessage?.({ data: { type: 'move', roomId: 'room', playerId: 'player', dx: -200, dy: -100, visibleCount: 3, highlighted: true, dismissDeadline: 10000 } });
    await vi.waitFor(() => expect(state.opened).toHaveLength(5));
    expect(state.opened[4].anchorPosition).toEqual({ left: 594, top: 324 });
    expect(loadRevealPosition('player')).toEqual({ left: 594, top: 324 });
    reveal.onmessage?.({ data: { type: 'ready', roomId: 'room', playerId: 'player' } });
    expect(reveal.sent).toContainEqual(expect.objectContaining({ type: 'show', resume: { visibleCount: 3, highlighted: true, dismissDeadline: 10000 } }));
    state.width = 700;
    state.height = 500;
    reveal.onmessage?.({ data: { type: 'result', roomId: 'room', playerId: 'player', result: { version: 1, requestId: 'glass2', expression: 'd1', dialect: 'nodice', visibility: 'self', playerId: 'player', playerName: 'Player', value: 1, trace: [], time: 2 } } });
    await vi.waitFor(() => expect(state.opened).toHaveLength(6));
    expect(state.opened[5].anchorPosition).toEqual({ left: 294, top: 124 });
    send({ type: 'toggle' });
    await vi.waitFor(() => expect(loadDraft('room', 'player')).toBeNull());
    expect(panel.sent).toContainEqual(expect.objectContaining({ type: 'state', open: false }));
    send({ type: 'toggle' });
    await vi.waitFor(() => expect(state.opened).toHaveLength(7));
    expect(state.opened[6].url).not.toContain('resume=1');
    expect(panel.sent.at(-1)).toEqual(expect.objectContaining({ type: 'state', open: true }));
    vi.unstubAllGlobals();
  });
});
