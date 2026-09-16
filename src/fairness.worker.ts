import { parse, parseAuto } from './engine/parser';
import type { Dialect } from './engine/ast';
import { FairnessSampler } from './engine/fairness';
import { fairnessRollsPerSecond } from './engine/fairnessPacing';

type Command = { type: 'start'; id: number; expression: string; dialect?: Dialect } | { type: 'stop'; id: number };
let active: { id: number; sampler: FairnessSampler; timer: number; lastReport: number; startedAt: number; lastTick: number; credit: number } | null = null;

function stop() {
  if (!active) return;
  clearTimeout(active.timer);
  self.postMessage({ id: active.id, type: 'snapshot', snapshot: active.sampler.snapshot(), running: false });
  active = null;
}

function tick(id: number) {
  if (!active || active.id !== id) return;
  try {
    const started = performance.now();
    const elapsed = Math.max(0, started - active.lastTick);
    active.lastTick = started;
    // Discard excess credit if a costly expression cannot keep pace. Stop stays responsive.
    active.credit = Math.min(200, active.credit + elapsed * fairnessRollsPerSecond(started - active.startedAt) / 1000);
    let rolled = 0;
    while (active.credit >= 1 && performance.now() - started < 12) {
      const batch = Math.min(10, Math.floor(active.credit));
      active.sampler.sample(batch);
      active.credit -= batch;
      rolled += batch;
    }
    if (rolled && (started - active.lastReport >= 100 || active.sampler.snapshot().total === 1)) {
      self.postMessage({ id, type: 'snapshot', snapshot: active.sampler.snapshot(), running: true });
      active.lastReport = started;
    }
    active.timer = self.setTimeout(() => tick(id), 50);
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
    const now = performance.now();
    active = { id: command.id, sampler: new FairnessSampler(command.dialect?parse(command.expression,command.dialect):parseAuto(command.expression).ast), timer: 0, lastReport: now, startedAt: now, lastTick: now, credit: 1 };
    tick(command.id);
  } catch (error) {
    self.postMessage({ id: command.id, type: 'error', error: error instanceof Error ? error.message : 'Sampling failed' });
    active = null;
  }
};
