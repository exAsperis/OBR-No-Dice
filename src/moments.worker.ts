import { analyzeRollMoments } from './rollMoments';
import type { StoredRoll } from './sessionLedger';

const cache = new Map();
self.onmessage = (event: MessageEvent<{id:number;rolls:StoredRoll[]}>) => {
  const {id,rolls} = event.data;
  try { self.postMessage({id,moments:[...analyzeRollMoments(rolls,cache)]}); }
  catch { self.postMessage({id,moments:[]}); }
};
