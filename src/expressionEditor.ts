export const MAX_EXPRESSION_EDITOR_HEIGHT = 180;

/** Re-measure after every text or width change so wrapping grows and shrinks. */
export function resizeExpressionEditor(editor: HTMLTextAreaElement): void {
  editor.style.height = 'auto';
  const height = Math.min(editor.scrollHeight, MAX_EXPRESSION_EDITOR_HEIGHT);
  editor.style.height = `${height}px`;
  editor.style.overflowY = editor.scrollHeight > MAX_EXPRESSION_EDITOR_HEIGHT ? 'auto' : 'hidden';
}
