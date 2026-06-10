import { useEffect, useCallback } from 'react';
import { isEditableTarget } from '@/lib/domUtils';

interface ShortcutHandlers {
  onSave?: () => void;
  onDelete?: () => void;
  onEscape?: () => void;
}

/**
 * Keyboard shortcuts hook for the editor
 *
 * Shortcuts:
 * - Ctrl/Cmd + S: Save
 * - Delete/Backspace: Delete selected node
 * - Escape: Clear selection / close panels
 */
export function useKeyboardShortcuts({
  onSave,
  onDelete,
  onEscape,
}: ShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in input fields (incl. select)
      const isInputField = isEditableTarget(e.target);

      // Ctrl/Cmd + S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSave?.();
        return;
      }

      // Skip other shortcuts when in input fields
      if (isInputField) return;

      // Delete/Backspace: Delete selected node
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete?.();
        return;
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }
    },
    [onSave, onDelete, onEscape]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
