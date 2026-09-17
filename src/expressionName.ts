/** A trailing top-level # names a roll without participating in its grammar. */
export function splitExpressionName(source: string): { expression: string; name?: string; suffix: string } {
  let depth = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '#' && depth === 0) {
      const name = source.slice(index + 1).trim();
      return { expression: source.slice(0, index).trimEnd(), name: name || undefined, suffix: source.slice(index) };
    }
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
  }
  return { expression: source, suffix: '' };
}

export const resultHeading = (source: string): string => splitExpressionName(source).name || 'RESULT';
