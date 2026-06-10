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
  from: { nodeId: string; port: string; fieldPaths?: string[] };
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
export type PluginCategory =
  | 'control'
  | 'input'
  | 'llm'
  | 'tts'
  | 'avatar'
  | 'output'
  | 'utility'
  | 'obs';

export interface PluginUI {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  statusText?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: {
    name: string;
    url?: string;
  } | string;
  license: string;
  category: PluginCategory;
  ui?: PluginUI;
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

export interface CategoryDefinition {
  id: PluginCategory;
  label: string;
  labelEn: string;
  order: number;
  description?: string;
}

export interface PortDefinition {
  id: string;
  type: string;
  description?: string;
}

export interface ConfigField {
  type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'select'
    | 'textarea'
    | 'password'
    | 'prompt-builder'
    | 'input-list'
    | 'expression-list'
    | 'animation-file'
    | 'model-file'
    | 'png-expression-map';
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: { label: string; value: unknown }[] | string[];
  min?: number;
  max?: number;
  placeholder?: string;
  accept?: string;
  dynamic?: boolean;
  dependsOn?: string;
  showWhen?: ShowWhenCondition;
  inline?: boolean;
}

export type ShowWhenCondition =
  | { key: string; value: string | string[] }
  | { field: string; operator?: string; value: string | string[] };

export interface NodeField {
  key: string;
  type:
    | 'text'
    | 'number'
    | 'textarea'
    | 'select'
    | 'checkbox'
    | 'animation-file'
    | 'model-file'
    | 'prompt-builder'
    | 'input-list'
    | 'expression-list'
    | 'password'
    | 'png-expression-map';
  label: string;
  placeholder?: string;
  options?: { label: string; value: string | number }[];
  min?: number;
  max?: number;
  required?: boolean;
  defaultValue?: unknown;
  dynamic?: boolean;
  dependsOn?: string;
  accept?: string;
  showWhen?: ShowWhenCondition;
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
  status: 'idle' | 'running' | 'completed' | 'error' | 'warning';
  data?: any;
}

// Activity feed: one execution cycle = one trigger firing and its downstream wave
export interface CycleStep {
  nodeId: string;
  status: 'running' | 'completed' | 'error';
  startedAt: string;
  duration?: number;
  resultSummary?: string;
  textPreview?: string;
  error?: string;
}

export interface CycleTrigger {
  sourceNodeId: string;
  eventType: string;
  summary: string;
}

export interface ActivityCycle {
  id: string;
  startedAt: string;
  trigger?: CycleTrigger;
  steps: CycleStep[];
  status: 'running' | 'completed' | 'error';
  totalDuration: number;
}

// Avatar types
export type AvatarRendererType = 'vrm' | 'vtube-studio' | 'png';

export interface AvatarState {
  expression: string;
  mouthOpen: number;
  motion?: string;
  lookAt?: { x: number; y: number };
}

export interface AvatarConfig {
  renderer: AvatarRendererType;
  modelUrl?: string;
  vtubePort?: number;
  pngConfig?: PNGAvatarConfig;
  autoEmotion?: boolean;
  autoLipsync?: boolean;
}

export interface PNGAvatarConfig {
  baseUrl: string;
  expressions: Record<string, string>;
  defaultExpression: string;
}

// Avatar WebSocket events
export interface AvatarExpressionEvent {
  expression: string;
  intensity?: number;
}

export interface AvatarMouthEvent {
  value: number;
  viseme?: string;
}

export interface AvatarMotionEvent {
  motion: string;
}

export interface AvatarLookAtEvent {
  x: number;
  y: number;
}

export type AvatarUpdateEvent = Partial<AvatarState>;

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
