// Workflow types
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  connections: Connection[];
  character: CharacterConfig;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  config: Record<string, any>;
  eventFilters?: EventFilter[];
}

export interface EventFilter {
  event: string;
  condition?: string;
}

export interface Connection {
  id: string;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
}

// Character types
export interface CharacterConfig {
  name: string;
  personality: string;
}

export interface CharacterState extends CharacterConfig {
  emotion: {
    current: string;
    intensity: number;
  };
  memory: {
    shortTerm: Message[];
    longTerm: Memory[];
  };
  currentTopic?: string;
  lastSpokeAt?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  author?: string;
  timestamp: string;
  metadata?: {
    superchat?: number;
    isMember?: boolean;
  };
}

export interface Memory {
  id: string;
  content: string;
  timestamp: string;
}

// Plugin types
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: {
    name: string;
    url?: string;
  };
  license: string;
  category: 'input' | 'process' | 'output' | 'control';
  node: {
    inputs: PortDefinition[];
    outputs: PortDefinition[];
    events?: {
      emits?: string[];
      listens?: string[];
    };
  };
  config: Record<string, ConfigField>;
}

export interface PortDefinition {
  id: string;
  type: string;
  description?: string;
}

export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'textarea';
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  options?: { label: string; value: any }[];
  min?: number;
  max?: number;
}

// Execution types
export interface ExecutionLog {
  id: string;
  level: 'info' | 'warning' | 'error' | 'debug' | 'success';
  message: string;
  nodeId?: string;
  timestamp: string;
}

export interface NodeStatus {
  nodeId: string;
  status: 'idle' | 'running' | 'success' | 'error';
  data?: any;
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
