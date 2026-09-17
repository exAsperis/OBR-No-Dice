import type { Dialect } from './engine/ast';
import { cryptoRng, roll, type Rng, type Value } from './engine/evaluate';
import { formatLongReadable, formatShort } from './engine/format';
import { parse, parseAuto } from './engine/parser';
import type { RollResult, Visibility } from './protocol';

export const displayValue = (value: Value): string => Array.isArray(value) ? `[${value.join(', ')}]` : String(value);

export interface RollExpressionInput {
  requestId: string;
  expression: string;
  dialect?: Dialect;
  visibility: Visibility;
  playerId: string;
  playerName: string;
  label?: string;
  source?: string;
}

export interface CompletedRoll {
  record: RollResult;
  shortExpression: string;
  longExpression: string;
  display: string;
}

/** The sole application roll path for UI and external API requests. */
export function rollExpression(input: RollExpressionInput, rng: Rng = cryptoRng): CompletedRoll {
  const parsed = input.dialect
    ? { ast: parse(input.expression, input.dialect), dialect: input.dialect }
    : parseAuto(input.expression);
  const outcome = roll(parsed.ast, rng);
  const record: RollResult = {
    version: 1,
    requestId: input.requestId,
    expression: input.expression,
    dialect: parsed.dialect,
    visibility: input.visibility,
    playerId: input.playerId,
    playerName: input.playerName,
    value: outcome.value,
    interpretation: outcome.interpretation,
    trace: outcome.trace,
    steps: outcome.stages,
    stepDice: outcome.stageDice,
    time: Date.now(),
    label: input.label,
    source: input.source,
  };
  return {
    record,
    shortExpression: formatShort(parsed.ast),
    longExpression: formatLongReadable(parsed.ast),
    display: `${displayValue(outcome.value)}${outcome.interpretation ? ` · ${outcome.interpretation}` : ''}`,
  };
}
