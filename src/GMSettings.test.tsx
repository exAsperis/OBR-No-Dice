import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GMSettings } from './GMSettings';
import { ROOM_SETTINGS_KEY } from './roomSettings';

const state = vi.hoisted(() => ({ role: 'GM', saved: [] as unknown[] }));
vi.mock('@owlbear-rodeo/sdk', () => ({ default: {
  player: { getRole: async () => state.role },
  room: { setMetadata: async (metadata: unknown) => { state.saved.push(metadata); } },
} }));

describe('GM settings editor', () => {
  it('shows live peer readiness and applies the toggle immediately', async () => {
    state.saved.length=0;
    const settings={calculationSpeedMs:500,shortcuts:[],verifiableRollsEnabled:true};
    const view=render(<GMSettings settings={settings} verifiableRollsAvailable={false} onSaved={()=>{}}/>);
    expect(screen.getByRole('status').textContent).toMatch(/Waiting/);
    view.rerender(<GMSettings settings={settings} verifiableRollsAvailable={true} onSaved={()=>{}}/>);
    expect(screen.getByRole('status').textContent).toMatch(/Ready/);
    fireEvent.click(screen.getByLabelText('Verifiable Rolls'));
    await waitFor(()=>expect(state.saved).toEqual([{[ROOM_SETTINGS_KEY]:{...settings,verifiableRollsEnabled:false}}]));
    await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
  });
  it('renames, reorders, removes and adds shortcuts before saving the room settings', async () => {
    state.saved.length = 0;
    render(<GMSettings settings={{ calculationSpeedMs: 1000, verifiableRollsEnabled: false, shortcuts: [{ label: 'd6', term: 'd6' }, { label: 'd8', term: 'd8' }] }} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText('Calculation speed (ms)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Shortcut 1 name'), { target: { value: 'Six' } });
    fireEvent.click(screen.getByLabelText('Move shortcut 2 up'));
    fireEvent.click(screen.getByLabelText('Remove shortcut 1'));
    fireEvent.click(screen.getByText('Add shortcut'));
    fireEvent.change(screen.getByLabelText('Shortcut 2 name'), { target: { value: 'Coin' } });
    fireEvent.change(screen.getByLabelText('Shortcut 2 expression'), { target: { value: 'd{0,1}' } });
    fireEvent.click(screen.getByText('Save settings'));
    await waitFor(() => expect(state.saved).toEqual([{ [ROOM_SETTINGS_KEY]: { calculationSpeedMs: 0, verifiableRollsEnabled: false, shortcuts: [{ label: 'Six', term: 'd6' }, { label: 'Coin', term: 'd{0,1}' }] } }]));
  });
  it('checks the current role before writing', async () => {
    state.saved.length = 0; state.role = 'PLAYER';
    render(<GMSettings settings={{ calculationSpeedMs: 1000, verifiableRollsEnabled: false, shortcuts: [] }} onSaved={() => {}} />);
    fireEvent.click(screen.getAllByText('Save settings').at(-1)!);
    await screen.findByRole('alert');
    expect(state.saved).toHaveLength(0);
    state.role = 'GM';
  });
  it('refuses a toggle write if the role is no longer GM', async()=>{
    state.saved.length=0;state.role='PLAYER';
    render(<GMSettings settings={{calculationSpeedMs:500,shortcuts:[],verifiableRollsEnabled:false}} onSaved={()=>{}}/>);
    fireEvent.click(screen.getByLabelText('Verifiable Rolls'));
    await screen.findByRole('alert');
    expect(state.saved).toHaveLength(0);
    expect((screen.getByLabelText('Verifiable Rolls') as HTMLInputElement).checked).toBe(false);
    state.role='GM';
  });
});
