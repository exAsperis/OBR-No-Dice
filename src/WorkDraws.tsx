import type { RollResult } from './protocol';
import type { RollMoment } from './rollMoments';
import { explosionColor, rarityColor } from './rarity';
import type { CSSProperties } from 'react';

/** A draw's index, rather than its rendered text, ties the badge to its rarity. */
export function WorkDraws({ result, indices, moments }: { result: RollResult; indices?: number[]; moments: RollMoment[] }) {
  const dieMoments=moments.filter(moment=>moment.type==='die-rarity');
  return <span className="work-draws">{indices?.map(index => {
    const draw = result.resolution?.dice[index];
    if (!draw) return null;
    const moment = dieMoments.find(item => item.drawIndex === index);
    const color=draw.exploded?explosionColor(draw.explosionNumber??1):moment?rarityColor(moment.tier):undefined;
    return <span key={index} data-draw-index={index} className={`work-draw${moment ? ` rarity-${moment.tier}` : ''}${draw.exploded?` work-draw-exploded explosion-${Math.min(draw.explosionNumber??1,4)}`:''}`} style={color?{'--rarity-color':color} as CSSProperties:undefined} title={moment?.label ?? `${draw.die} → ${String(draw.face)}`}><span className="work-draw-face">{String(draw.face)}</span></span>;
  })}</span>;
}

export function WorkDieCell({ die, result, indices, moments }: { die?: string; result: RollResult; indices?: number[]; moments: RollMoment[] }) {
  return <span className="work-die-cell"><span className="work-die">{die}</span><WorkDraws result={result} indices={indices} moments={moments}/></span>;
}
