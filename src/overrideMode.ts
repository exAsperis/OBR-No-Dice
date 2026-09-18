import { ROOM_SETTINGS_KEY, readRoomSettings, type RoomSettings } from './roomSettings';
import { readSharedSession, SESSION_KEY, type DiceSession } from './sessionLedger';
import { validDieOverride, type DieOverride } from './dieOverrides';

export function validOverrideList(overrides: readonly DieOverride[]): boolean {
  return overrides.length <= 30 && overrides.every(validDieOverride)
    && new Set(overrides.map(item=>item.die)).size === overrides.length;
}

export function overrideTransition(metadata: Record<string,unknown>, overrides: DieOverride[], enabled: boolean,
  createId:()=>string = () => crypto.randomUUID(), now = Date.now()): {settings: RoomSettings; session: DiceSession} {
  if(!validOverrideList(overrides))throw new Error('Enter unique dice such as d20 with a legal face value.');
  const current=readRoomSettings(metadata),mode=current.overrideMode;
  const shared=readSharedSession(metadata);
  if(!shared)throw new Error('The current room session is unavailable.');
  if(enabled){
    if(mode?.enabled)throw new Error('Override Mode is already active.');
    if(shared.kind==='override')throw new Error('The room is already in an override session.');
    const session:DiceSession={id:`override-${createId()}`,name:'OVERRIDE',startedAt:now,kind:'override'};
    return {session,settings:{...current,verifiableRollsEnabled:false,overrideMode:{enabled:true,overrides,
      previousVerifiableRollsEnabled:current.verifiableRollsEnabled,previousSession:shared,overrideSession:session}}};
  }
  if(!mode?.enabled||!mode.previousSession)throw new Error('Override Mode is not active.');
  return {session:mode.previousSession,settings:{...current,verifiableRollsEnabled:mode.previousVerifiableRollsEnabled===true,
    overrideMode:{enabled:false,overrides}}};
}

export function overrideMetadata(transition: {settings:RoomSettings;session:DiceSession}) {
  return {[ROOM_SETTINGS_KEY]:transition.settings,[SESSION_KEY]:transition.session};
}
