import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NodeDisplayMode = 'simple' | 'standard' | 'detailed';

interface UIPreferencesState {
  nodeDisplayMode: NodeDisplayMode;
  setNodeDisplayMode: (mode: NodeDisplayMode) => void;
}

export const useUIPreferencesStore = create<UIPreferencesState>()(
  persist(
    (set) => ({
      nodeDisplayMode: 'standard',
      setNodeDisplayMode: (mode) => set({ nodeDisplayMode: mode }),
    }),
    {
      name: 'aituber-flow-ui-preferences',
    }
  )
);
