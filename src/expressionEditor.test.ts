import { describe, expect, it } from 'vitest';
import { MAX_EXPRESSION_EDITOR_HEIGHT, resizeExpressionEditor } from './expressionEditor';

describe('expression editor sizing', () => {
  it('grows and shrinks with wrapping, then scrolls beyond its height limit', () => {
    const editor = document.createElement('textarea');
    let contentHeight = 70;
    Object.defineProperty(editor, 'scrollHeight', { get: () => contentHeight });
    resizeExpressionEditor(editor);
    expect(editor.style.height).toBe('70px');
    expect(editor.style.overflowY).toBe('hidden');
    contentHeight = MAX_EXPRESSION_EDITOR_HEIGHT + 50;
    resizeExpressionEditor(editor);
    expect(editor.style.height).toBe(`${MAX_EXPRESSION_EDITOR_HEIGHT}px`);
    expect(editor.style.overflowY).toBe('auto');
    contentHeight = 34;
    resizeExpressionEditor(editor);
    expect(editor.style.height).toBe('34px');
    expect(editor.style.overflowY).toBe('hidden');
  });
});
