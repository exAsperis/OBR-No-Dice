import { EXTENSION_ID } from './constants';
import { ExpressionError } from './engine/ast';
import type { Value } from './engine/evaluate';
import type { CompletedRoll } from './rollService';

export const NO_DICE_API_REQUEST = `${EXTENSION_ID}/api/request`;
export const NO_DICE_API_RESPONSE = `${EXTENSION_ID}/api/response`;
export const NO_DICE_API_PROTOCOL_VERSION = 1 as const;
export const MAX_API_EXPRESSION_LENGTH = 1000;
export const MAX_API_BROADCAST_BYTES = 12_000;

export interface NoDiceRollRequestV1 {
  protocolVersion: 1;
  type: 'roll';
  requestId: string;
  expression: string;
  options?: { record?: boolean; label?: string };
}

export type NoDicePublicAtom = number | string;
export type NoDicePublicValue =
  | { kind: 'number'; value: number }
  | { kind: 'text'; value: string }
  | { kind: 'pool'; values: NoDicePublicAtom[] };

export interface NoDiceRollSuccessV1 {
  protocolVersion: 1;
  type: 'rollResult';
  requestId: string;
  ok: true;
  expression: { input: string; short: string; long: string };
  result: NoDicePublicValue;
  display: string;
}
export type NoDiceApiErrorCode = 'INVALID_REQUEST' | 'UNSUPPORTED_VERSION' | 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'EVALUATION_ERROR';
export interface NoDiceRollErrorV1 {
  protocolVersion: 1;
  type: 'rollResult';
  requestId: string;
  ok: false;
  error: { code: NoDiceApiErrorCode; message: string; start?: number; end?: number };
}
export type NoDiceRollResponseV1 = NoDiceRollSuccessV1 | NoDiceRollErrorV1;

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function usableRequestId(value: unknown): string | null {
  if (!object(value)) return null;
  const id = value.requestId;
  return typeof id === 'string' && id.trim().length > 0 && id.length <= 128 ? id : null;
}
export function isNoDiceRollRequestV1(value: unknown): value is NoDiceRollRequestV1 {
  if (!object(value) || value.protocolVersion !== 1 || value.type !== 'roll' || !usableRequestId(value)) return false;
  if (typeof value.expression !== 'string' || !value.expression.trim() || value.expression.length > MAX_API_EXPRESSION_LENGTH) return false;
  if (value.options === undefined) return true;
  if (!object(value.options)) return false;
  return (value.options.record === undefined || typeof value.options.record === 'boolean')
    && (value.options.label === undefined || (typeof value.options.label === 'string' && value.options.label.length <= 200));
}
export function isNoDiceRollResponseV1(value: unknown): value is NoDiceRollResponseV1 {
  if (!object(value) || value.protocolVersion !== 1 || value.type !== 'rollResult' || typeof value.requestId !== 'string') return false;
  if (value.ok === false) return object(value.error) && typeof value.error.message === 'string' && typeof value.error.code === 'string';
  if (value.ok !== true || !object(value.expression) || typeof value.display !== 'string' || !object(value.result)) return false;
  if (typeof value.expression.input !== 'string' || typeof value.expression.short !== 'string' || typeof value.expression.long !== 'string') return false;
  return value.result.kind === 'pool' ? Array.isArray(value.result.values)
    : value.result.kind === 'number' ? typeof value.result.value === 'number'
    : value.result.kind === 'text' && typeof value.result.value === 'string';
}

export function toPublicResult(value: Value, interpretation?: string): NoDicePublicValue {
  if (interpretation !== undefined) return { kind: 'text', value: interpretation };
  if (Array.isArray(value)) return { kind: 'pool', values: value };
  return typeof value === 'number' ? { kind: 'number', value } : { kind: 'text', value };
}
export function successResponse(requestId: string, completed: CompletedRoll): NoDiceRollSuccessV1 {
  return {
    protocolVersion: 1, type: 'rollResult', requestId, ok: true,
    expression: { input: completed.record.expression, short: completed.shortExpression, long: completed.longExpression },
    result: toPublicResult(completed.record.value, completed.record.interpretation),
    display: completed.display,
  };
}
export function errorResponse(requestId: string, code: NoDiceApiErrorCode, message: string, start?: number, end?: number): NoDiceRollErrorV1 {
  return { protocolVersion: 1, type: 'rollResult', requestId, ok: false, error: { code, message, ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) } };
}
export function rollErrorResponse(requestId: string, error: unknown): NoDiceRollErrorV1 {
  if (error instanceof ExpressionError) {
    const diagnostic = error.diagnostic;
    const parseCodes = new Set(['SYNTAX', 'UNEXPECTED_CHARACTER', 'EMPTY', 'EMPTY_DIE']);
    const isParseError = diagnostic && (parseCodes.has(diagnostic.code) || diagnostic.code.includes('INTERPRETATION'));
    const code: NoDiceApiErrorCode = diagnostic ? isParseError ? 'PARSE_ERROR' : 'VALIDATION_ERROR' : 'EVALUATION_ERROR';
    return errorResponse(requestId, code, error.message, diagnostic?.start, diagnostic?.end);
  }
  return errorResponse(requestId, 'EVALUATION_ERROR', error instanceof Error ? error.message : 'Roll failed');
}
