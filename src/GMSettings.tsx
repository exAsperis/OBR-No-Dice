import OBR from '@owlbear-rodeo/sdk';
import { useEffect, useState } from 'react';
import { ROOM_SETTINGS_KEY, type RoomSettings, type Shortcut } from './roomSettings';

export function GMSettings({ settings, onSaved }: { settings: RoomSettings; onSaved: () => void }) {
  const [speed, setSpeed] = useState(String(settings.calculationSpeedMs));
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(settings.shortcuts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setSpeed(String(settings.calculationSpeedMs)); setShortcuts(settings.shortcuts); }, [settings]);
  const update = (index: number, field: keyof Shortcut, value: string) => setShortcuts(previous => previous.map((item, position) => position === index ? { ...item, [field]: value } : item));
  const move = (index: number, offset: number) => setShortcuts(previous => {
    const next = [...previous];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    return next;
  });
  const valid = Number.isInteger(Number(speed)) && Number(speed) >= 0 && Number(speed) <= 10000
    && shortcuts.length <= 30 && shortcuts.every(item => item.label.trim().length > 0 && item.label.length <= 32 && item.term.trim().length > 0 && item.term.length <= 200);
  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError('');
    try {
      if (await OBR.player.getRole() !== 'GM') throw new Error('Only the GM can change room settings.');
      await OBR.room.setMetadata({ [ROOM_SETTINGS_KEY]: { calculationSpeedMs: Number(speed), shortcuts: shortcuts.map(item => ({ label: item.label.trim(), term: item.term.trim() })) } });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save settings.'); }
    finally { setSaving(false); }
  }
  return <section className="gm-settings" aria-label="GM settings">
    <h2>GM Settings</h2>
    <label className="speed-setting">Calculation speed (ms)<input type="number" min="0" max="10000" step="1" value={speed} onChange={event => setSpeed(event.target.value)} /></label>
    <p>0 shows the result instantly. The speed applies to everyone in this room.</p>
    <h3>Shortcut buttons</h3>
    <div className="shortcut-editor">{shortcuts.map((item, index) => <div className="shortcut-editor-row" key={index}>
      <input aria-label={`Shortcut ${index + 1} name`} maxLength={32} value={item.label} onChange={event => update(index, 'label', event.target.value)} placeholder="Name" />
      <input aria-label={`Shortcut ${index + 1} expression`} maxLength={200} value={item.term} onChange={event => update(index, 'term', event.target.value)} placeholder="Expression" />
      <button type="button" aria-label={`Move shortcut ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
      <button type="button" aria-label={`Move shortcut ${index + 1} down`} disabled={index === shortcuts.length - 1} onClick={() => move(index, 1)}>↓</button>
      <button type="button" aria-label={`Remove shortcut ${index + 1}`} onClick={() => setShortcuts(previous => previous.filter((_, position) => position !== index))}>×</button>
    </div>)}</div>
    <div className="settings-actions"><button type="button" disabled={shortcuts.length >= 30} onClick={() => setShortcuts(previous => [...previous, { label: '', term: '' }])}>Add shortcut</button><button type="button" disabled={!valid || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save settings'}</button></div>
    {error && <p role="alert" className="input-error">{error}</p>}
  </section>;
}
