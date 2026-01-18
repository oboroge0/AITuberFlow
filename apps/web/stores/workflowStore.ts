import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowNode, Connection, ExecutionLog, NodeStatus, CharacterConfig } from '@/lib/types';

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
  removeConnection: (id: string) => void;

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

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // Initial state
  workflowId: null,
  workflowName: 'New Workflow',
  nodes: [],
  connections: [],
  character: defaultCharacter,
  selectedNodeId: null,
  isExecuting: false,
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
      nodes: [...state.nodes, newNode],
      selectedNodeId: id,
    }));
    return id;
  },

  updateNode: (id, updates) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, ...updates } : node
      ),
    }));
  },

  removeNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      connections: state.connections.filter(
        (conn) => conn.from.nodeId !== id && conn.to.nodeId !== id
      ),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }));
  },

  setNodePosition: (id, position) => {
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
        connections: [...state.connections, newConnection],
      }));
    }
    return id;
  },

  removeConnection: (id) => {
    set((state) => ({
      connections: state.connections.filter((conn) => conn.id !== id),
    }));
  },

  // Execution actions
  setExecuting: (executing) => set({ isExecuting: executing }),

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
