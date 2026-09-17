import { describe, expect, it } from 'vitest';
import { parse, parseAuto } from './engine/parser';
import { formatShort } from './engine/format';
import { roll } from './engine/evaluate';
import { resultHeading, splitExpressionName } from './expressionName';
import { insertDiceShortcut } from './shortcuts';

describe('named expressions', () => {
  it('ignores a trailing name for parsing but preserves it for display', () => {
    expect(formatShort(parse('2d6 # Sneak Attack'))).toBe('2d6');
    expect(splitExpressionName('2d6 # Sneak Attack')).toEqual({ expression: '2d6', name: 'Sneak Attack', suffix: '# Sneak Attack' });
    expect(resultHeading('2d6 # Sneak Attack')).toBe('Sneak Attack');
    expect(resultHeading('2d6')).toBe('RESULT');
    expect(roll(parseAuto('2d6 | 6-:Miss; 7+:Hit # Attack').ast, { integer: () => 3 }).value).toBe(8);
    expect(resultHeading('2d6 | 6-:Miss; 7+:Hit # Attack')).toBe('Attack');
    expect(insertDiceShortcut('d6 # Attack', 'd6')).toBe('2d6 # Attack');
    expect(insertDiceShortcut('d6 | 6-:Miss; 7+:Hit # Attack', 'd6')).toBe('2d6 | 6-:Miss; 7+:Hit # Attack');
  });
  it('requires a nonempty name', () => {
    expect(() => parse('d6 # ')).toThrow('Enter a name');
  });
});
