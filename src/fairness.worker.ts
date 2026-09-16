import { parse, parseAuto } from './engine/parser';
import type { Dialect } from './engine/ast';
import { FairnessSampler } from './engine/fairness';

type Command = { type: 'start'; id: number; expression: string; dialect?: Dialect } | { type: 'stop'; id: number };
let active: { id: number; sampler: FairnessSampler; timer: number; lastReport: number } | null = null;

function stop() {
  if (!active) return;
  clearTimeout(active.timer);
  self.postMessage({ id: active.id, type: 'snapshot', snapshot: active.sampler.snapshot(), running: false });
  active = null;
}

function tick(id: number) {
  if (!active || active.id !== id) return;
  try {
    // Yield to the worker event loop frequently so Stop and changed input take effect promptly.
    const started = performance.now();
    do { active.sampler.sample(10); } while (performance.now() - started < 20);
    if (performance.now() - active.lastReport >= 100) {
      self.postMessage({ id, type: 'snapshot', snapshot: active.sampler.snapshot(), running: true });
      active.lastReport = performance.now();
    }
    active.timer = self.setTimeout(() => tick(id), 0);
  } catch (error) {
    self.postMessage({ id, type: 'error', error: error instanceof Error ? error.message : 'Sampling failed' });
    stop();
  }
}

self.onmessage = (event: MessageEvent<Command>) => {
  const command = event.data;
  if (command.type === 'stop') { if (active?.id === command.id) stop(); return; }
  stop();
  try {
    active = { id: command.id, sampler: new FairnessSampler(command.dialect?parse(command.expression,command.dialect):parseAuto(command.expression).ast), timer: 0, lastReport: 0 };
    tick(command.id);
  } catch (error) {
    self.postMessage({ id: command.id, type: 'error', error: error instanceof Error ? error.message : 'Sampling failed' });
    active = null;
  }
};
