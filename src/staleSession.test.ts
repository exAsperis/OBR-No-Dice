import { describe, expect, it } from 'vitest';
import { detectStaleSession, reminderKey, SOFT_STALE_AFTER, VERY_STALE_AFTER } from './staleSession';
import type { DiceSession, StoredRoll } from './sessionLedger';

const session:DiceSession={id:'current',name:'Current',startedAt:1000};
const roll=(timestamp:number):StoredRoll=>({timestamp,sessionId:'current',id:String(timestamp),rollerId:'p',rollerName:'Player'} as StoredRoll);

describe('stale session reminder',()=>{
  it('requires a GM and a nonempty session',()=>{expect(detectStaleSession(session,[],true,VERY_STALE_AFTER+2000)).toBeUndefined();expect(detectStaleSession(session,[roll(1000)],false,VERY_STALE_AFTER+2000)).toBeUndefined();expect(detectStaleSession(session,[roll(1000)],true,SOFT_STALE_AFTER)).toBeUndefined();});
  it('reports soft and very stale gaps and the first resumed roll',()=>{const soft=detectStaleSession(session,[roll(1000)],true,1001+SOFT_STALE_AFTER)!;expect(soft.level).toBe('soft');const resumed=1000+VERY_STALE_AFTER+1;const very=detectStaleSession(session,[roll(1000),roll(resumed),roll(resumed+1000)],true,resumed+2000)!;expect(very).toMatchObject({resumedAt:resumed,lastOldRoll:1000,level:'very'});expect(reminderKey(very)).toBe(`current/${resumed}`);});
  it('uses a new key for a later separate gap',()=>{const first=1000+SOFT_STALE_AFTER+1,second=first+SOFT_STALE_AFTER+1;const previous=detectStaleSession(session,[roll(1000),roll(first)],true,first)!;const later=detectStaleSession(session,[roll(1000),roll(first),roll(second)],true,second)!;expect(reminderKey(previous)).not.toBe(reminderKey(later));expect(later.resumedAt).toBe(second);});
});
