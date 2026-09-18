import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GMSettings } from './GMSettings';
import { ROOM_SETTINGS_KEY } from './roomSettings';
import { SESSION_KEY } from './sessionLedger';

const state = vi.hoisted(() => ({ role: 'GM', saved: [] as unknown[], metadata:{} as Record<string,unknown> }));
vi.mock('@owlbear-rodeo/sdk', () => ({ default: {
  player: { getRole: async () => state.role },
  room: { getMetadata:async()=>state.metadata, setMetadata: async (metadata: Record<string,unknown>) => { state.saved.push(metadata);Object.assign(state.metadata,metadata); } },
} }));

describe('GM settings editor', () => {
  it('shows live peer readiness and applies the toggle immediately', async () => {
    state.saved.length=0;
    const settings={calculationSpeedMs:500,shortcuts:[],verifiableRollsEnabled:true};
    const view=render(<GMSettings settings={settings} verifiableRollsAvailable={false}/>);
    expect(screen.getByRole('status').textContent).toMatch(/Waiting/);
    view.rerender(<GMSettings settings={settings} verifiableRollsAvailable={true}/>);
    expect(screen.getByRole('status').textContent).toMatch(/Ready/);
    fireEvent.click(screen.getByLabelText('Verifiable Rolls'));
    await waitFor(()=>expect(state.saved).toEqual([{[ROOM_SETTINGS_KEY]:{...settings,verifiableRollsEnabled:false,overrideMode:{enabled:false,overrides:[]}}}]));
    await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
  });
  it('saves edited fields on blur and structural shortcut changes immediately', async () => {
    state.saved.length = 0;
    render(<GMSettings settings={{ calculationSpeedMs: 1000, verifiableRollsEnabled: false, shortcuts: [{ label: 'd6', term: 'd6' }, { label: 'd8', term: 'd8' }] }} />);
    fireEvent.change(screen.getByLabelText('Calculation speed (ms)'), { target: { value: '0' } });
    fireEvent.blur(screen.getByLabelText('Calculation speed (ms)'));
    fireEvent.change(screen.getByLabelText('Shortcut 1 name'), { target: { value: 'Six' } });
    fireEvent.blur(screen.getByLabelText('Shortcut 1 name'));
    fireEvent.click(screen.getByLabelText('Move shortcut 2 up'));
    fireEvent.click(screen.getByLabelText('Remove shortcut 1'));
    fireEvent.click(screen.getByText('Add shortcut'));
    fireEvent.change(screen.getByLabelText('Shortcut 2 name'), { target: { value: 'Coin' } });
    fireEvent.change(screen.getByLabelText('Shortcut 2 expression'), { target: { value: 'd{0,1}' } });
    fireEvent.blur(screen.getByLabelText('Shortcut 2 expression'));
    await waitFor(() => expect(state.saved.at(-1)).toEqual({ [ROOM_SETTINGS_KEY]: { calculationSpeedMs: 0, verifiableRollsEnabled: false, overrideMode:{enabled:false,overrides:[]}, shortcuts: [{ label: 'Six', term: 'd6' }, { label: 'Coin', term: 'd{0,1}' }] } }));
    expect(screen.queryByText('Save settings')).toBeNull();
  });
  it('checks the current role before writing', async () => {
    state.saved.length = 0; state.role = 'PLAYER';
    render(<GMSettings settings={{ calculationSpeedMs: 1000, verifiableRollsEnabled: false, shortcuts: [] }} />);
    fireEvent.change(screen.getByLabelText('Calculation speed (ms)'),{target:{value:'500'}});
    fireEvent.blur(screen.getByLabelText('Calculation speed (ms)'));
    await screen.findByRole('alert');
    expect(state.saved).toHaveLength(0);
    state.role = 'GM';
  });
  it('refuses a toggle write if the role is no longer GM', async()=>{
    state.saved.length=0;state.role='PLAYER';
    render(<GMSettings settings={{calculationSpeedMs:500,shortcuts:[],verifiableRollsEnabled:false}}/>);
    fireEvent.click(screen.getByLabelText('Verifiable Rolls'));
    await screen.findByRole('alert');
    expect(state.saved).toHaveLength(0);
    expect((screen.getByLabelText('Verifiable Rolls') as HTMLInputElement).checked).toBe(false);
    state.role='GM';
  });
  it('changes the shared session atomically and disables Verifiable Rolls during Override',async()=>{
    state.saved.length=0;state.role='GM';
    const real={id:'real',name:'Friday Game',startedAt:1};
    state.metadata={[SESSION_KEY]:real,[ROOM_SETTINGS_KEY]:{calculationSpeedMs:500,shortcuts:[],verifiableRollsEnabled:true}};
    render(<GMSettings settings={{calculationSpeedMs:500,shortcuts:[],verifiableRollsEnabled:true,overrideMode:{enabled:false,overrides:[]}}}/>);
    fireEvent.click(screen.getByText('Add Override'));
    fireEvent.change(screen.getByLabelText('Override 1 die'),{target:{value:'d20'}});
    fireEvent.change(screen.getByLabelText('Override 1 value'),{target:{value:'20'}});
    fireEvent.blur(screen.getByLabelText('Override 1 value'));
    await waitFor(()=>expect(state.saved.at(-1)).toEqual(expect.objectContaining({[ROOM_SETTINGS_KEY]:expect.objectContaining({overrideMode:{enabled:false,overrides:[{die:'d20',value:20}]}})})));
    fireEvent.click(screen.getByLabelText('Override Mode'));
    await waitFor(()=>expect(state.saved.at(-1)).toEqual(expect.objectContaining({[SESSION_KEY]:expect.objectContaining({name:'OVERRIDE',kind:'override'}),[ROOM_SETTINGS_KEY]:expect.objectContaining({verifiableRollsEnabled:false})})));
    expect((screen.getByLabelText('Verifiable Rolls') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Override Mode'));
    await waitFor(()=>expect(state.saved.at(-1)).toEqual(expect.objectContaining({[SESSION_KEY]:real,[ROOM_SETTINGS_KEY]:expect.objectContaining({verifiableRollsEnabled:true})})));
    expect((screen.getByLabelText('Verifiable Rolls') as HTMLInputElement).disabled).toBe(false);
  });
  it('refuses to activate Override Mode when the editor is no longer GM',async()=>{
    state.saved.length=0;state.role='PLAYER';
    state.metadata={[SESSION_KEY]:{id:'real',name:'Game',startedAt:1}};
    render(<GMSettings settings={{calculationSpeedMs:500,shortcuts:[],verifiableRollsEnabled:false}}/>);
    fireEvent.click(screen.getByLabelText('Override Mode'));
    await screen.findByRole('alert');
    expect(state.saved).toHaveLength(0);
    state.role='GM';
  });
});
