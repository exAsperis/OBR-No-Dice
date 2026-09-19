import type { Dialect } from './engine/ast';
import { cryptoRng, roll, type Rng, type Value } from './engine/evaluate';
import { formatLongReadable, formatShort } from './engine/format';
import { parse, parseAuto } from './engine/parser';
import type { RollResult, Visibility } from './protocol';
import { createDieOverrideResolver, type DieOverride } from './dieOverrides';

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
  overridden?: boolean;
  overrides?: DieOverride[];
  overrideSequenceKey?: string;
}

const overrideResolvers = new Map<string, { signature: string; resolve: ReturnType<typeof createDieOverrideResolver> }>();
function overrideResolver(input: RollExpressionInput) {
  const overrides = input.overrides ?? [], signature = JSON.stringify(overrides);
  const key = input.overrideSequenceKey ?? input.requestId;
  const cached = overrideResolvers.get(key);
  if (cached?.signature === signature) return cached.resolve;
  const resolve = createDieOverrideResolver(overrides);
  overrideResolvers.set(key, { signature, resolve });
  if (overrideResolvers.size > 32) overrideResolvers.delete(overrideResolvers.keys().next().value!);
  return resolve;
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
  const outcome = roll(parsed.ast, rng, true, input.overridden ? {dieOverride:overrideResolver(input)} : undefined);
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
    stepDrawIndices: outcome.stageDrawIndices,
    resolution: { ast: parsed.ast, dice: outcome.dice ?? [] },
    time: Date.now(),
    label: input.label,
    source: input.source,
    overridden: input.overridden ? true : undefined,
  };
  return {
    record,
    shortExpression: formatShort(parsed.ast),
    longExpression: formatLongReadable(parsed.ast),
    display: `${displayValue(outcome.value)}${outcome.interpretation ? ` · ${outcome.interpretation}` : ''}`,
  };
}
