/**
 * DOM utilities shared across editor components.
 */

/**
 * Returns true when the event target is an element that accepts text/value
 * input (input, textarea, select, contentEditable). Keyboard shortcuts like
 * Delete/Backspace/Ctrl+Z must be ignored while one of these has focus —
 * otherwise pressing Delete inside a node's inline dropdown deletes the node.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}
