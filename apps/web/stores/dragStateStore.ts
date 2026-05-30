/**
 * Drag-state store — tracks what port type is currently being dragged
 * so nodes can highlight / dim their handles accordingly.
 */
import { create } from 'zustand';
import type { PortType } from '@/lib/portTypes';

interface DragState {
  /** Type of the port currently being dragged from, or null when idle. */
  draggingSourceType: PortType | null;
  /** 'source' when dragging from output, 'target' when from input (reconnect). */
  draggingHandleType: 'source' | 'target' | null;
  setDragging: (sourceType: PortType | null, handleType: 'source' | 'target' | null) => void;
  clearDragging: () => void;
}

export const useDragStateStore = create<DragState>((set) => ({
  draggingSourceType: null,
  draggingHandleType: null,
  setDragging: (sourceType, handleType) => set({ draggingSourceType: sourceType, draggingHandleType: handleType }),
  clearDragging: () => set({ draggingSourceType: null, draggingHandleType: null }),
}));
