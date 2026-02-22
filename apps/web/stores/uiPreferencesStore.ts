import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NodeDisplayMode = 'simple' | 'standard' | 'detailed';

interface UIPreferencesState {
  // Node display
  nodeDisplayMode: NodeDisplayMode;
  setNodeDisplayMode: (mode: NodeDisplayMode) => void;

  // Node collapse state (persisted)
  collapsedNodeIds: string[];
  toggleNodeCollapse: (nodeId: string) => void;
  expandAllNodes: () => void;

  // Search state (transient, not persisted)
  searchVisible: boolean;
  searchQuery: string;
  searchMatchIndex: number;
  setSearchVisible: (visible: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSearchMatchIndex: (index: number) => void;
}

export const useUIPreferencesStore = create<UIPreferencesState>()(
  persist(
    (set, get) => ({
      // Node display
      nodeDisplayMode: 'standard',
      setNodeDisplayMode: (mode) => set({ nodeDisplayMode: mode }),

      // Node collapse
      collapsedNodeIds: [],
      toggleNodeCollapse: (nodeId: string) => {
        const current = get().collapsedNodeIds;
        const isCollapsed = current.includes(nodeId);
        set({
          collapsedNodeIds: isCollapsed
            ? current.filter((id) => id !== nodeId)
            : [...current, nodeId],
        });
      },
      expandAllNodes: () => set({ collapsedNodeIds: [] }),

      // Search (transient)
      searchVisible: false,
      searchQuery: '',
      searchMatchIndex: 0,
      setSearchVisible: (visible) =>
        set({
          searchVisible: visible,
          searchQuery: visible ? get().searchQuery : '',
          searchMatchIndex: 0,
        }),
      setSearchQuery: (query) => set({ searchQuery: query, searchMatchIndex: 0 }),
      setSearchMatchIndex: (index) => set({ searchMatchIndex: index }),
    }),
    {
      name: 'aituber-flow-ui-preferences',
      partialize: (state) => ({
        nodeDisplayMode: state.nodeDisplayMode,
        collapsedNodeIds: state.collapsedNodeIds,
      }),
    }
  )
);
