import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredRoll } from './sessionLedger';

const state = vi.hoisted(() => ({
  rolls: [] as StoredRoll[],
  messages: [] as unknown[],
}));

vi.mock('@owlbear-rodeo/sdk', () => ({ default: {
  room: {
    id: 'room',
    getMetadata: async () => ({}),
    onMetadataChange: () => () => {},
  },
  player: { id: 'player' },
  theme: { getTheme: async () => ({}), onChange: () => () => {} },
  onReady: (callback: () => void) => { void callback(); },
} }));
vi.mock('./sessionLedger', () => ({
  LEDGER_CHANNEL: 'ledger',
  getSessionRolls: async () => state.rolls,
  listSessions: async () => [{ id: 'session', name: 'Friday Game' }],
  migrateHistory: async () => {},
  readSharedSession: () => null,
  synchronizeRoomSession: async () => {},
}));
vi.mock('./AnalyticsTabs', () => ({
  tabs: ['overview', 'players', 'expressions', 'outcomes', 'highlights', 'timeline', 'ledger', 'fairness'],
  AnalyticsTabs: ({ rolls }: { rolls: StoredRoll[] }) => <output data-testid="roll-count">{rolls.length}</output>,
}));

class TestBroadcastChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  close() {}
  postMessage(message: unknown) { state.messages.push(message); }
}

vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);

const makeRoll = (visibility: StoredRoll['visibility']) => ({ visibility } as StoredRoll);

beforeEach(() => {
  sessionStorage.clear();
  state.messages.length = 0;
  state.rolls = [makeRoll('everyone'), makeRoll('self'), makeRoll('gm')];
});

describe('Statistics audience control', () => {
  it('defaults to public rolls, updates the shared downstream set, and restores its choice', async () => {
    const { Statistics } = await import('./statisticsMain');
    const view = render(<Statistics />);
    const scope = await screen.findByText('Include private rolls');
    const checkbox = screen.getByRole('checkbox', { name: 'Include private rolls' });

    expect((checkbox as HTMLInputElement).checked).toBe(false);
    expect(within(scope.closest('.statistics-scope-row')!).getByRole('combobox')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('roll-count').textContent).toBe('1'));

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect(screen.getByTestId('roll-count').textContent).toBe('3'));

    fireEvent.click(screen.getByRole('button', { name: 'Maximize statistics window' }));
    expect(JSON.parse(sessionStorage.getItem('com.ex-asperis.no-dice/statistics-view-transition')!).includePrivate).toBe(true);

    view.unmount();
    vi.resetModules();
    const { Statistics: RestoredStatistics } = await import('./statisticsMain');
    render(<RestoredStatistics />);
    await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Include private rolls' }) as HTMLInputElement).checked).toBe(true));
  });
});
