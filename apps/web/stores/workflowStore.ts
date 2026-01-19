import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowNode, Connection, ExecutionLog, NodeStatus, CharacterConfig } from '@/lib/types';

// History state for undo/redo
interface HistoryState {
  nodes: WorkflowNode[];
  connections: Connection[];
}

interface WorkflowState {
  // Workflow data
  workflowId: string | null;
  workflowName: string;
  nodes: WorkflowNode[];
  connections: Connection[];
  character: CharacterConfig;

  // UI state
  selectedNodeId: string | null;
  isExecuting: boolean;

  // History for undo/redo
  past: HistoryState[];
  future: HistoryState[];

  // Clipboard for copy/paste
  clipboard: { nodes: WorkflowNode[]; connections: Connection[] } | null;

  // Execution state
  logs: ExecutionLog[];
  nodeStatuses: Record<string, NodeStatus>;

  // Actions
  setWorkflowId: (id: string | null) => void;
  setWorkflowName: (name: string) => void;
  setCharacter: (character: CharacterConfig) => void;

  // Node actions
  addNode: (node: Omit<WorkflowNode, 'id'>) => string;
  updateNode: (id: string, updates: Partial<WorkflowNode>) => void;
  removeNode: (id: string) => void;
  setNodePosition: (id: string, position: { x: number; y: number }) => void;
  selectNode: (id: string | null) => void;

  // Connection actions
  addConnection: (conn: Omit<Connection, 'id'>) => string;
  updateConnection: (id: string, updates: Partial<Omit<Connection, 'id'>>) => void;
  removeConnection: (id: string) => void;

  // History actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Clipboard actions
  copySelectedNodes: () => void;
  pasteNodes: () => void;

  // Execution actions
  setExecuting: (executing: boolean) => void;
  addLog: (log: Omit<ExecutionLog, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  setNodeStatus: (nodeId: string, status: NodeStatus['status'], data?: any) => void;

  // Bulk actions
  loadWorkflow: (data: {
    id: string;
    name: string;
    nodes: WorkflowNode[];
    connections: Connection[];
    character: CharacterConfig;
  }) => void;
  clearWorkflow: () => void;
  getWorkflowData: () => {
    id: string | null;
    name: string;
    nodes: WorkflowNode[];
    connections: Connection[];
    character: CharacterConfig;
  };
}

const defaultCharacter: CharacterConfig = {
  name: 'AI Assistant',
  personality: 'Friendly and helpful virtual streamer',
};

// Helper to save current state to history
const saveToHistory = (state: WorkflowState): Partial<WorkflowState> => ({
  past: [...state.past, { nodes: state.nodes, connections: state.connections }].slice(-50), // Keep last 50 states
  future: [], // Clear future on new action
});

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // Initial state
  workflowId: null,
  workflowName: 'New Workflow',
  nodes: [],
  connections: [],
  character: defaultCharacter,
  selectedNodeId: null,
  isExecuting: false,
  past: [],
  future: [],
  clipboard: null,
  logs: [],
  nodeStatuses: {},

  // Basic setters
  setWorkflowId: (id) => set({ workflowId: id }),
  setWorkflowName: (name) => set({ workflowName: name }),
  setCharacter: (character) => set({ character }),

  // Node actions
  addNode: (node) => {
    const id = uuidv4();
    const newNode: WorkflowNode = { ...node, id };
    set((state) => ({
      ...saveToHistory(state),
      nodes: [...state.nodes, newNode],
      selectedNodeId: id,
    }));
    return id;
  },

  updateNode: (id, updates) => {
    set((state) => ({
      ...saveToHistory(state),
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, ...updates } : node
      ),
    }));
  },

  removeNode: (id) => {
    set((state) => ({
      ...saveToHistory(state),
      nodes: state.nodes.filter((node) => node.id !== id),
      connections: state.connections.filter(
        (conn) => conn.from.nodeId !== id && conn.to.nodeId !== id
      ),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }));
  },

  setNodePosition: (id, position) => {
    // Don't save to history for every position change (would be too noisy)
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, position } : node
      ),
    }));
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  // Connection actions
  addConnection: (conn) => {
    const id = uuidv4();
    const newConnection: Connection = { ...conn, id };

    // Prevent duplicate connections
    const exists = get().connections.some(
      (c) =>
        c.from.nodeId === conn.from.nodeId &&
        c.from.port === conn.from.port &&
        c.to.nodeId === conn.to.nodeId &&
        c.to.port === conn.to.port
    );

    if (!exists) {
      set((state) => ({
        ...saveToHistory(state),
        connections: [...state.connections, newConnection],
      }));
    }
    return id;
  },

  updateConnection: (id, updates) => {
    set((state) => ({
      ...saveToHistory(state),
      connections: state.connections.map((conn) =>
        conn.id === id ? { ...conn, ...updates } : conn
      ),
    }));
  },

  removeConnection: (id) => {
    set((state) => ({
      ...saveToHistory(state),
      connections: state.connections.filter((conn) => conn.id !== id),
    }));
  },

  // History actions
  undo: () => {
    const state = get();
    if (state.past.length === 0) return;

    const previous = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, -1);

    set({
      past: newPast,
      future: [{ nodes: state.nodes, connections: state.connections }, ...state.future],
      nodes: previous.nodes,
      connections: previous.connections,
    });
  },

  redo: () => {
    const state = get();
    if (state.future.length === 0) return;

    const next = state.future[0];
    const newFuture = state.future.slice(1);

    set({
      past: [...state.past, { nodes: state.nodes, connections: state.connections }],
      future: newFuture,
      nodes: next.nodes,
      connections: next.connections,
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  // Clipboard actions
  copySelectedNodes: () => {
    const state = get();
    if (!state.selectedNodeId) return;

    const selectedNode = state.nodes.find((n) => n.id === state.selectedNodeId);
    if (!selectedNode) return;

    // Copy the selected node and its connections
    const relatedConnections = state.connections.filter(
      (c) => c.from.nodeId === state.selectedNodeId || c.to.nodeId === state.selectedNodeId
    );

    set({
      clipboard: {
        nodes: [selectedNode],
        connections: relatedConnections,
      },
    });
  },

  pasteNodes: () => {
    const state = get();
    if (!state.clipboard || state.clipboard.nodes.length === 0) return;

    // Create new nodes with new IDs and offset positions
    const idMap: Record<string, string> = {};
    const newNodes: WorkflowNode[] = state.clipboard.nodes.map((node) => {
      const newId = uuidv4();
      idMap[node.id] = newId;
      return {
        ...node,
        id: newId,
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
      };
    });

    set((s) => ({
      ...saveToHistory(s),
      nodes: [...s.nodes, ...newNodes],
      selectedNodeId: newNodes.length > 0 ? newNodes[0].id : s.selectedNodeId,
    }));
  },

  // Execution actions
  setExecuting: (executing) => set({
    isExecuting: executing,
    nodeStatuses: executing ? {} : {}, // Clear statuses when starting
  }),

  addLog: (log) => {
    const newLog: ExecutionLog = {
      ...log,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      logs: [...state.logs, newLog].slice(-100), // Keep last 100 logs
    }));
  },

  clearLogs: () => set({ logs: [] }),

  setNodeStatus: (nodeId, status, data) => {
    set((state) => ({
      nodeStatuses: {
        ...state.nodeStatuses,
        [nodeId]: { nodeId, status, data },
      },
    }));
  },

  // Bulk actions
  loadWorkflow: (data) => {
    set({
      workflowId: data.id,
      workflowName: data.name,
      nodes: data.nodes,
      connections: data.connections,
      character: data.character,
      selectedNodeId: null,
      past: [],
      future: [],
      logs: [],
      nodeStatuses: {},
    });
  },

  clearWorkflow: () => {
    set({
      workflowId: null,
      workflowName: 'New Workflow',
      nodes: [],
      connections: [],
      character: defaultCharacter,
      selectedNodeId: null,
      isExecuting: false,
      past: [],
      future: [],
      clipboard: null,
      logs: [],
      nodeStatuses: {},
    });
  },

  getWorkflowData: () => {
    const state = get();
    return {
      id: state.workflowId,
      name: state.workflowName,
      nodes: state.nodes,
      connections: state.connections,
      character: state.character,
    };
  },
}));
