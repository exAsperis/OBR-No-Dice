import OBR from '@owlbear-rodeo/sdk';
import { useEffect, useRef, useState } from 'react';
import { ROOM_SETTINGS_KEY, type RoomSettings, type Shortcut } from './roomSettings';
import { Toggle } from './Toggle';
import { overrideMetadata, overrideTransition, validOverrideList } from './overrideMode';
import type { DieOverride } from './dieOverrides';

function valid(settings: RoomSettings): boolean {
  return Number.isInteger(settings.calculationSpeedMs) && settings.calculationSpeedMs >= 0 && settings.calculationSpeedMs <= 10000
    && settings.shortcuts.length <= 30 && settings.shortcuts.every(item => item.label.trim().length > 0 && item.label.length <= 32
      && item.term.trim().length > 0 && item.term.length <= 200)
    && validOverrideList(settings.overrideMode?.overrides??[]);
}

export function GMSettings({ settings, verifiableRollsAvailable = false }: { settings: RoomSettings; verifiableRollsAvailable?: boolean }) {
  const [draft, setDraft] = useState(settings);
  const [speedText, setSpeedText] = useState(String(settings.calculationSpeedMs));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draftRef = useRef(settings);
  const edited = useRef(false);
  const revision = useRef(0);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (edited.current) return;
    draftRef.current = settings;
    setDraft(settings);
    setSpeedText(String(settings.calculationSpeedMs));
  }, [settings]);

  const change = (next: RoomSettings) => {
    edited.current = true;
    revision.current++;
    draftRef.current = next;
    setDraft(next);
    setError('');
  };
  const save = async (snapshot = draftRef.current) => {
    if (!speedText.trim() || !valid(snapshot)) { setError('Complete shortcuts and overrides with unique legal dice and values.'); return; }
    const savedRevision = revision.current;
    setSaving(true);
    const task = queue.current.catch(() => {}).then(async () => {
      if (await OBR.player.getRole() !== 'GM') throw new Error('Only the GM can change room settings.');
      await OBR.room.setMetadata({ [ROOM_SETTINGS_KEY]: {
        calculationSpeedMs: snapshot.calculationSpeedMs,
        verifiableRollsEnabled: snapshot.verifiableRollsEnabled,
        shortcuts: snapshot.shortcuts.map(item => ({ label: item.label.trim(), term: item.term.trim() })),
        overrideMode: snapshot.overrideMode??{enabled:false,overrides:[]},
      } });
    });
    queue.current = task;
    try {
      await task;
      if (revision.current === savedRevision) edited.current = false;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save settings.');
      if (revision.current === savedRevision && snapshot.verifiableRollsEnabled !== settings.verifiableRollsEnabled) {
        const restored = { ...draftRef.current, verifiableRollsEnabled: settings.verifiableRollsEnabled };
        draftRef.current = restored; setDraft(restored);
      }
    } finally { if (queue.current === task) setSaving(false); }
  };
  const updateShortcut = (index: number, field: keyof Shortcut, value: string) =>
    change({ ...draftRef.current, shortcuts: draftRef.current.shortcuts.map((item, position) => position === index ? { ...item, [field]: value } : item) });
  const moveShortcut = (index: number, offset: number) => {
    const shortcuts = [...draftRef.current.shortcuts];
    [shortcuts[index], shortcuts[index + offset]] = [shortcuts[index + offset], shortcuts[index]];
    const next = { ...draftRef.current, shortcuts }; change(next); void save(next);
  };
  const removeShortcut = (index: number) => {
    const next = { ...draftRef.current, shortcuts: draftRef.current.shortcuts.filter((_, position) => position !== index) };
    change(next); void save(next);
  };
  const toggleVerifiable = (enabled: boolean) => {
    if(draftRef.current.overrideMode?.enabled)return;
    const next = { ...draftRef.current, verifiableRollsEnabled: enabled };
    if (!speedText.trim() || !valid(next)) { setError('Complete each shortcut and use a calculation speed from 0 to 10000.'); return; }
    change(next); void save(next);
  };
  const updateOverride = (index:number,field:keyof DieOverride,value:string) => {
    const mode=draftRef.current.overrideMode??{enabled:false,overrides:[]};
    const overrides=mode.overrides.map((item,position)=>position===index?{...item,[field]:field==='value'?Number(value):value.trim().toLowerCase()}:item);
    change({...draftRef.current,overrideMode:{...mode,overrides}});
  };
  const removeOverride=(index:number)=>{
    const mode=draftRef.current.overrideMode??{enabled:false,overrides:[]};
    const next={...draftRef.current,overrideMode:{...mode,overrides:mode.overrides.filter((_,position)=>position!==index)}};
    change(next);void save(next);
  };
  const toggleOverride=async(enabled:boolean)=>{
    const overrides=draftRef.current.overrideMode?.overrides??[];
    if(!validOverrideList(overrides)){setError('Enter unique dice such as d20 with a legal face value.');return;}
    setSaving(true);setError('');
    const task=queue.current.catch(()=>{}).then(async()=>{
      if(await OBR.player.getRole()!=='GM')throw new Error('Only the GM can change Override Mode.');
      const metadata=await OBR.room.getMetadata();
      const transition=overrideTransition(metadata,overrides,enabled);
      await OBR.room.setMetadata(overrideMetadata(transition));
      return transition.settings;
    });
    queue.current=task.then(()=>{}).catch(()=>{});
    try{const next=await task;edited.current=false;draftRef.current=next;setDraft(next);}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not change Override Mode.');}
    finally{setSaving(false);}
  };
  return <section className="gm-settings" aria-label="GM settings">
    <h2>GM Settings</h2>
    <label className="speed-setting">Calculation speed (ms)<input type="number" min="0" max="10000" step="1" value={speedText}
      onChange={event => { setSpeedText(event.target.value); change({ ...draftRef.current, calculationSpeedMs: Number(event.target.value) }); }}
      onBlur={() => void save()} /></label>
    <p>0 shows the result instantly. The speed applies to everyone in this room.</p>
    <Toggle className="verification-setting" checked={draft.verifiableRollsEnabled} disabled={saving||draft.overrideMode?.enabled}
      onChange={toggleVerifiable}>Verifiable Rolls</Toggle>
    <p>Uses another connected No Dice client to verify each roll when available.</p>
    {draft.verifiableRollsEnabled && <p className="verification-status" role="status">{saving?'Updating room setting…':verifiableRollsAvailable?'Ready — a compatible No Dice peer is reachable.':'Waiting for a compatible No Dice peer to respond.'}</p>}
    <h3>Override Mode</h3>
    <Toggle checked={draft.overrideMode?.enabled??false} disabled={saving} onChange={enabled=>void toggleOverride(enabled)}>Override Mode</Toggle>
    <p>Configured dice use the chosen face for every player. Rolls go into a disposable OVERRIDE session.</p>
    <div className="override-editor">{(draft.overrideMode?.overrides??[]).map((item,index)=><div className="override-editor-row" key={index}>
      <input aria-label={`Override ${index+1} die`} placeholder="d20" value={item.die} onChange={event=>updateOverride(index,'die',event.target.value)} onBlur={()=>void save()}/>
      <input aria-label={`Override ${index+1} value`} type="number" step="1" value={item.value} onChange={event=>updateOverride(index,'value',event.target.value)} onBlur={()=>void save()}/>
      <button type="button" aria-label={`Remove override ${index+1}`} onClick={()=>removeOverride(index)}>×</button>
    </div>)}</div>
    <div className="settings-actions"><button type="button" disabled={(draft.overrideMode?.overrides.length??0)>=30} onClick={()=>{const mode=draftRef.current.overrideMode??{enabled:false,overrides:[]};change({...draftRef.current,overrideMode:{...mode,overrides:[...mode.overrides,{die:'',value:1}]}});}}>Add Override</button></div>
    <h3>Shortcut buttons</h3>
    <div className="shortcut-editor">{draft.shortcuts.map((item, index) => <div className="shortcut-editor-row" key={index}>
      <input aria-label={`Shortcut ${index + 1} name`} maxLength={32} value={item.label} onChange={event => updateShortcut(index, 'label', event.target.value)} onBlur={() => void save()} placeholder="Name" />
      <input aria-label={`Shortcut ${index + 1} expression`} maxLength={200} value={item.term} onChange={event => updateShortcut(index, 'term', event.target.value)} onBlur={() => void save()} placeholder="Expression" />
      <button type="button" aria-label={`Move shortcut ${index + 1} up`} disabled={index === 0} onClick={() => moveShortcut(index, -1)}>↑</button>
      <button type="button" aria-label={`Move shortcut ${index + 1} down`} disabled={index === draft.shortcuts.length - 1} onClick={() => moveShortcut(index, 1)}>↓</button>
      <button type="button" aria-label={`Remove shortcut ${index + 1}`} onClick={() => removeShortcut(index)}>×</button>
    </div>)}</div>
    <div className="settings-actions"><button type="button" disabled={draft.shortcuts.length >= 30} onClick={() => change({ ...draftRef.current, shortcuts: [...draftRef.current.shortcuts, { label: '', term: '' }] })}>Add shortcut</button></div>
    {error && <p role="alert" className="input-error">{error}</p>}
  </section>;
}
