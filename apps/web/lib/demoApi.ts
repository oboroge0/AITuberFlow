import { Workflow, ApiResponse } from './types';
import { v4 as uuidv4 } from 'uuid';

// Demo-specific plugin manifest structure (different from the full PluginManifest)
interface DemoPluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  nodes: DemoNodeDefinition[];
}

interface DemoNodeDefinition {
  type: string;
  label: string;
  category: string;
  color: string;
  inputs: { id: string; label: string; type: string }[];
  outputs: { id: string; label: string; type: string }[];
  configSchema: { key: string; label: string; type: string; options?: string[]; default?: any }[];
}

// Demo templates embedded in the code
const DEMO_TEMPLATES = [
  {
    id: 'basic-chat',
    name: 'Basic Chat Response',
    description: 'シンプルなチャット応答フロー。チャット入力 → LLM → 音声出力',
    nodeCount: 3,
    connectionCount: 2,
    nodes: [
      {
        id: 'input-1',
        type: 'manual-input',
        position: { x: 100, y: 200 },
        data: {
          label: 'Chat Input',
          config: {},
        },
      },
      {
        id: 'llm-1',
        type: 'openai-chat',
        position: { x: 400, y: 200 },
        data: {
          label: 'LLM',
          config: {
            model: 'gpt-4o-mini',
            systemPrompt: 'You are a friendly AI VTuber assistant.',
          },
        },
      },
      {
        id: 'output-1',
        type: 'voicevox',
        position: { x: 700, y: 200 },
        data: {
          label: 'VOICEVOX',
          config: {
            speakerId: 1,
          },
        },
      },
    ],
    connections: [
      { id: 'conn-1', source: 'input-1', target: 'llm-1', sourceHandle: 'output', targetHandle: 'input' },
      { id: 'conn-2', source: 'llm-1', target: 'output-1', sourceHandle: 'output', targetHandle: 'input' },
    ],
    character: {
      name: 'AI Assistant',
      personality: 'Friendly and helpful',
    },
  },
  {
    id: 'youtube-live',
    name: 'YouTube Live VTuber',
    description: 'YouTube配信向けの完全なAI VTuberフロー',
    nodeCount: 5,
    connectionCount: 4,
    nodes: [
      {
        id: 'yt-1',
        type: 'youtube-chat',
        position: { x: 100, y: 200 },
        data: {
          label: 'YouTube Chat',
          config: {},
        },
      },
      {
        id: 'filter-1',
        type: 'chat-filter',
        position: { x: 300, y: 200 },
        data: {
          label: 'Filter',
          config: {
            minLength: 5,
            maxLength: 200,
          },
        },
      },
      {
        id: 'llm-1',
        type: 'openai-chat',
        position: { x: 500, y: 200 },
        data: {
          label: 'LLM',
          config: {
            model: 'gpt-4o',
          },
        },
      },
      {
        id: 'voice-1',
        type: 'voicevox',
        position: { x: 700, y: 150 },
        data: {
          label: 'VOICEVOX',
          config: {},
        },
      },
      {
        id: 'avatar-1',
        type: 'avatar-control',
        position: { x: 700, y: 300 },
        data: {
          label: 'Avatar',
          config: {},
        },
      },
    ],
    connections: [
      { id: 'conn-1', source: 'yt-1', target: 'filter-1', sourceHandle: 'output', targetHandle: 'input' },
      { id: 'conn-2', source: 'filter-1', target: 'llm-1', sourceHandle: 'output', targetHandle: 'input' },
      { id: 'conn-3', source: 'llm-1', target: 'voice-1', sourceHandle: 'output', targetHandle: 'input' },
      { id: 'conn-4', source: 'llm-1', target: 'avatar-1', sourceHandle: 'output', targetHandle: 'input' },
    ],
    character: {
      name: 'VTuber',
      personality: 'Energetic and entertaining streamer',
    },
  },
  {
    id: 'discord-bot',
    name: 'Discord Bot',
    description: 'Discordサーバー向けのAIアシスタント',
    nodeCount: 3,
    connectionCount: 2,
    nodes: [
      {
        id: 'discord-1',
        type: 'discord-message',
        position: { x: 100, y: 200 },
        data: {
          label: 'Discord',
          config: {},
        },
      },
      {
        id: 'llm-1',
        type: 'openai-chat',
        position: { x: 400, y: 200 },
        data: {
          label: 'LLM',
          config: {},
        },
      },
      {
        id: 'reply-1',
        type: 'discord-reply',
        position: { x: 700, y: 200 },
        data: {
          label: 'Reply',
          config: {},
        },
      },
    ],
    connections: [
      { id: 'conn-1', source: 'discord-1', target: 'llm-1', sourceHandle: 'output', targetHandle: 'input' },
      { id: 'conn-2', source: 'llm-1', target: 'reply-1', sourceHandle: 'output', targetHandle: 'input' },
    ],
    character: {
      name: 'Discord Assistant',
      personality: 'Helpful community assistant',
    },
  },
];

// Demo plugins (node types available in the editor)
const DEMO_PLUGINS: DemoPluginManifest[] = [
  {
    id: 'core-input',
    name: 'Input Nodes',
    version: '1.0.0',
    description: 'Core input nodes',
    author: 'AITuberFlow',
    nodes: [
      {
        type: 'manual-input',
        label: 'Manual Input',
        category: 'input',
        color: '#10B981',
        inputs: [],
        outputs: [{ id: 'output', label: 'Text', type: 'string' }],
        configSchema: [],
      },
      {
        type: 'youtube-chat',
        label: 'YouTube Chat',
        category: 'input',
        color: '#EF4444',
        inputs: [],
        outputs: [{ id: 'output', label: 'Message', type: 'chat-message' }],
        configSchema: [
          { key: 'videoId', label: 'Video ID', type: 'string' },
        ],
      },
      {
        type: 'twitch-chat',
        label: 'Twitch Chat',
        category: 'input',
        color: '#9333EA',
        inputs: [],
        outputs: [{ id: 'output', label: 'Message', type: 'chat-message' }],
        configSchema: [
          { key: 'channel', label: 'Channel', type: 'string' },
        ],
      },
      {
        type: 'discord-message',
        label: 'Discord Message',
        category: 'input',
        color: '#5865F2',
        inputs: [],
        outputs: [{ id: 'output', label: 'Message', type: 'chat-message' }],
        configSchema: [],
      },
    ],
  },
  {
    id: 'core-llm',
    name: 'LLM Nodes',
    version: '1.0.0',
    description: 'Language model nodes',
    author: 'AITuberFlow',
    nodes: [
      {
        type: 'openai-chat',
        label: 'OpenAI Chat',
        category: 'processing',
        color: '#10B981',
        inputs: [{ id: 'input', label: 'Input', type: 'string' }],
        outputs: [{ id: 'output', label: 'Response', type: 'string' }],
        configSchema: [
          { key: 'model', label: 'Model', type: 'select', options: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
          { key: 'systemPrompt', label: 'System Prompt', type: 'textarea' },
          { key: 'temperature', label: 'Temperature', type: 'number', default: 0.7 },
        ],
      },
      {
        type: 'anthropic-chat',
        label: 'Claude',
        category: 'processing',
        color: '#D97706',
        inputs: [{ id: 'input', label: 'Input', type: 'string' }],
        outputs: [{ id: 'output', label: 'Response', type: 'string' }],
        configSchema: [
          { key: 'model', label: 'Model', type: 'select', options: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'] },
          { key: 'systemPrompt', label: 'System Prompt', type: 'textarea' },
        ],
      },
      {
        type: 'gemini-chat',
        label: 'Gemini',
        category: 'processing',
        color: '#4285F4',
        inputs: [{ id: 'input', label: 'Input', type: 'string' }],
        outputs: [{ id: 'output', label: 'Response', type: 'string' }],
        configSchema: [
          { key: 'model', label: 'Model', type: 'select', options: ['gemini-pro', 'gemini-pro-vision'] },
        ],
      },
    ],
  },
  {
    id: 'core-filter',
    name: 'Filter Nodes',
    version: '1.0.0',
    description: 'Message filtering nodes',
    author: 'AITuberFlow',
    nodes: [
      {
        type: 'chat-filter',
        label: 'Chat Filter',
        category: 'processing',
        color: '#F59E0B',
        inputs: [{ id: 'input', label: 'Message', type: 'chat-message' }],
        outputs: [{ id: 'output', label: 'Filtered', type: 'chat-message' }],
        configSchema: [
          { key: 'minLength', label: 'Min Length', type: 'number', default: 1 },
          { key: 'maxLength', label: 'Max Length', type: 'number', default: 500 },
          { key: 'blockWords', label: 'Block Words', type: 'string' },
        ],
      },
      {
        type: 'random-selector',
        label: 'Random Selector',
        category: 'processing',
        color: '#8B5CF6',
        inputs: [{ id: 'input', label: 'Messages', type: 'chat-message' }],
        outputs: [{ id: 'output', label: 'Selected', type: 'chat-message' }],
        configSchema: [
          { key: 'interval', label: 'Interval (sec)', type: 'number', default: 30 },
        ],
      },
    ],
  },
  {
    id: 'core-voice',
    name: 'Voice Nodes',
    version: '1.0.0',
    description: 'Text-to-speech nodes',
    author: 'AITuberFlow',
    nodes: [
      {
        type: 'voicevox',
        label: 'VOICEVOX',
        category: 'output',
        color: '#EC4899',
        inputs: [{ id: 'input', label: 'Text', type: 'string' }],
        outputs: [{ id: 'audio', label: 'Audio', type: 'audio' }],
        configSchema: [
          { key: 'speakerId', label: 'Speaker', type: 'number', default: 1 },
          { key: 'speed', label: 'Speed', type: 'number', default: 1.0 },
        ],
      },
      {
        type: 'style-bert-vits2',
        label: 'Style-Bert-VITS2',
        category: 'output',
        color: '#06B6D4',
        inputs: [{ id: 'input', label: 'Text', type: 'string' }],
        outputs: [{ id: 'audio', label: 'Audio', type: 'audio' }],
        configSchema: [
          { key: 'model', label: 'Model', type: 'string' },
        ],
      },
    ],
  },
  {
    id: 'core-avatar',
    name: 'Avatar Nodes',
    version: '1.0.0',
    description: 'Avatar control nodes',
    author: 'AITuberFlow',
    nodes: [
      {
        type: 'avatar-control',
        label: 'Avatar Control',
        category: 'output',
        color: '#3B82F6',
        inputs: [{ id: 'input', label: 'Text', type: 'string' }],
        outputs: [],
        configSchema: [
          { key: 'expressionMapping', label: 'Expression Mapping', type: 'object' },
        ],
      },
      {
        type: 'obs-control',
        label: 'OBS Control',
        category: 'output',
        color: '#1F2937',
        inputs: [{ id: 'trigger', label: 'Trigger', type: 'any' }],
        outputs: [],
        configSchema: [
          { key: 'scene', label: 'Scene', type: 'string' },
          { key: 'action', label: 'Action', type: 'select', options: ['switch', 'toggle'] },
        ],
      },
    ],
  },
  {
    id: 'core-output',
    name: 'Output Nodes',
    version: '1.0.0',
    description: 'Output and reply nodes',
    author: 'AITuberFlow',
    nodes: [
      {
        type: 'discord-reply',
        label: 'Discord Reply',
        category: 'output',
        color: '#5865F2',
        inputs: [{ id: 'input', label: 'Text', type: 'string' }],
        outputs: [],
        configSchema: [],
      },
      {
        type: 'console-output',
        label: 'Console Output',
        category: 'output',
        color: '#6B7280',
        inputs: [{ id: 'input', label: 'Data', type: 'any' }],
        outputs: [],
        configSchema: [],
      },
    ],
  },
];

const STORAGE_KEY = 'aituberflow_demo_workflows';

class DemoApiClient {
  private getWorkflows(): Workflow[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  private saveWorkflows(workflows: Workflow[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
  }

  // Workflow endpoints
  async listWorkflows(): Promise<ApiResponse<Workflow[]>> {
    return { data: this.getWorkflows() };
  }

  async getWorkflow(id: string): Promise<ApiResponse<Workflow>> {
    const workflows = this.getWorkflows();
    const workflow = workflows.find(w => w.id === id);
    if (workflow) {
      return { data: workflow };
    }
    return { error: 'Workflow not found' };
  }

  async createWorkflow(workflow: Partial<Workflow>): Promise<ApiResponse<Workflow>> {
    const workflows = this.getWorkflows();
    const newWorkflow: Workflow = {
      id: uuidv4(),
      name: workflow.name || 'New Workflow',
      description: workflow.description || '',
      nodes: workflow.nodes || [],
      connections: workflow.connections || [],
      character: workflow.character || { name: 'AI Assistant', personality: '' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    workflows.unshift(newWorkflow);
    this.saveWorkflows(workflows);
    return { data: newWorkflow };
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<ApiResponse<Workflow>> {
    const workflows = this.getWorkflows();
    const index = workflows.findIndex(w => w.id === id);
    if (index === -1) {
      return { error: 'Workflow not found' };
    }
    workflows[index] = {
      ...workflows[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.saveWorkflows(workflows);
    return { data: workflows[index] };
  }

  async deleteWorkflow(id: string): Promise<ApiResponse<void>> {
    const workflows = this.getWorkflows();
    const filtered = workflows.filter(w => w.id !== id);
    this.saveWorkflows(filtered);
    return { data: undefined };
  }

  async duplicateWorkflow(id: string): Promise<ApiResponse<Workflow>> {
    const workflows = this.getWorkflows();
    const original = workflows.find(w => w.id === id);
    if (!original) {
      return { error: 'Workflow not found' };
    }
    const duplicate: Workflow = {
      ...original,
      id: uuidv4(),
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    workflows.unshift(duplicate);
    this.saveWorkflows(workflows);
    return { data: duplicate };
  }

  async exportWorkflow(id: string): Promise<ApiResponse<WorkflowExport>> {
    const workflows = this.getWorkflows();
    const workflow = workflows.find(w => w.id === id);
    if (!workflow) {
      return { error: 'Workflow not found' };
    }
    return {
      data: {
        name: workflow.name,
        description: workflow.description,
        nodes: workflow.nodes,
        connections: workflow.connections,
        character: workflow.character,
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
      },
    };
  }

  async importWorkflow(data: WorkflowExport): Promise<ApiResponse<Workflow>> {
    return this.createWorkflow({
      name: data.name,
      description: data.description,
      nodes: data.nodes,
      connections: data.connections,
      character: data.character,
    });
  }

  // Execution endpoints (demo mode - no-op)
  async startWorkflow(_id: string, _data?: any): Promise<ApiResponse<{ status: string }>> {
    return { data: { status: 'demo_mode' } };
  }

  async stopWorkflow(_id: string): Promise<ApiResponse<{ status: string }>> {
    return { data: { status: 'stopped' } };
  }

  // Plugin endpoints
  async listPlugins(): Promise<ApiResponse<DemoPluginManifest[]>> {
    return { data: DEMO_PLUGINS };
  }

  async getPlugin(id: string): Promise<ApiResponse<DemoPluginManifest>> {
    const plugin = DEMO_PLUGINS.find(p => p.id === id);
    if (plugin) {
      return { data: plugin };
    }
    return { error: 'Plugin not found' };
  }

  // Template endpoints
  async listTemplates(): Promise<ApiResponse<TemplateSummary[]>> {
    return {
      data: DEMO_TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        nodeCount: t.nodeCount,
        connectionCount: t.connectionCount,
      })),
    };
  }

  async getTemplate(id: string): Promise<ApiResponse<Template>> {
    const template = DEMO_TEMPLATES.find(t => t.id === id);
    if (template) {
      return {
        data: {
          id: template.id,
          name: template.name,
          description: template.description,
          nodes: template.nodes,
          connections: template.connections,
          character: template.character,
        },
      };
    }
    return { error: 'Template not found' };
  }

  // VOICEVOX integration (demo mode - return mock data)
  async getVoicevoxSpeakers(_host?: string): Promise<ApiResponse<{ speakers: VoicevoxSpeaker[] }>> {
    return {
      data: {
        speakers: [
          { id: 1, name: 'ずんだもん', style: 'normal', label: 'ずんだもん（ノーマル）' },
          { id: 2, name: '四国めたん', style: 'normal', label: '四国めたん（ノーマル）' },
          { id: 3, name: '春日部つむぎ', style: 'normal', label: '春日部つむぎ' },
        ],
      },
    };
  }

  async checkVoicevoxHealth(_host?: string): Promise<ApiResponse<{ status: string; version?: string }>> {
    return { data: { status: 'demo_mode', version: 'demo' } };
  }

  // Model endpoints (demo mode)
  async uploadModel(_file: File): Promise<ApiResponse<ModelUploadResult>> {
    return { error: 'Model upload is not available in demo mode' };
  }

  async listModels(): Promise<ApiResponse<{ models: ModelInfo[] }>> {
    return { data: { models: [] } };
  }

  async deleteModel(_filename: string): Promise<ApiResponse<{ success: boolean }>> {
    return { error: 'Not available in demo mode' };
  }

  // Animation endpoints (demo mode)
  async uploadAnimation(_file: File): Promise<ApiResponse<AnimationUploadResult>> {
    return { error: 'Animation upload is not available in demo mode' };
  }

  async listAnimations(): Promise<ApiResponse<{ animations: AnimationInfo[] }>> {
    return { data: { animations: [] } };
  }

  async deleteAnimation(_filename: string): Promise<ApiResponse<{ success: boolean }>> {
    return { error: 'Not available in demo mode' };
  }
}

// Type exports
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  connectionCount: number;
}

export interface WorkflowExport {
  name: string;
  description?: string;
  nodes: any[];
  connections: any[];
  character: {
    name: string;
    personality: string;
  };
  exportedAt?: string;
  version?: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  nodes: any[];
  connections: any[];
  character: {
    name: string;
    personality: string;
  };
}

export interface VoicevoxSpeaker {
  id: number;
  name: string;
  style: string;
  label: string;
}

export interface ModelUploadResult {
  success: boolean;
  filename: string;
  url: string;
  size: number;
}

export interface ModelInfo {
  filename: string;
  url: string;
  size: number;
  type: 'vrm' | 'image';
}

export interface AnimationUploadResult {
  success: boolean;
  filename: string;
  url: string;
  size: number;
}

export interface AnimationInfo {
  filename: string;
  url: string;
  size: number;
  type: string;
}

export const demoApi = new DemoApiClient();
export default demoApi;
