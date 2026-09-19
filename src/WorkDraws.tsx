import type { RollResult } from './protocol';
import type { RollMoment } from './rollMoments';

/** A draw's index, rather than its rendered text, ties the badge to its rarity. */
export function WorkDraws({ result, indices, moments }: { result: RollResult; indices?: number[]; moments: RollMoment[] }) {
  return <span className="work-draws">{indices?.map(index => {
    const draw = result.resolution?.dice[index];
    if (!draw) return null;
    const moment = moments.find(item => item.type === 'die-rarity' && item.drawIndex === index);
    return <span key={index} className={`work-draw${moment ? ` rarity-${moment.tier}` : ''}${draw.exploded?' work-draw-exploded':''}`} title={moment?.label ?? `${draw.die} → ${String(draw.face)}`}><span className="work-draw-face">{String(draw.face)}</span></span>;
  })}</span>;
}

export function WorkDieCell({ die, result, indices, moments }: { die?: string; result: RollResult; indices?: number[]; moments: RollMoment[] }) {
  return <span className="work-die-cell"><span className="work-die">{die}</span><WorkDraws result={result} indices={indices} moments={moments}/></span>;
}
