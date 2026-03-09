import { Workflow, PluginManifest, ApiResponse } from './types';
import { getErrorMessage } from './errorHandler';

// Use relative URLs in browser (proxied via Next.js rewrites)
// Use full URL only for server-side or when explicitly set
const API_BASE = typeof window !== 'undefined'
  ? ''  // Browser: use relative URLs (proxied by Next.js)
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001');

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        return { error: error.detail || `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      return { error: getErrorMessage(error, 'Network error') };
    }
  }

  // Workflow endpoints
  async listWorkflows(): Promise<ApiResponse<Workflow[]>> {
    return this.request<Workflow[]>('/api/workflows');
  }

  async getWorkflow(id: string): Promise<ApiResponse<Workflow>> {
    return this.request<Workflow>(`/api/workflows/${id}`);
  }

  async createWorkflow(workflow: Partial<Workflow>): Promise<ApiResponse<Workflow>> {
    return this.request<Workflow>('/api/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    });
  }

  async updateWorkflow(id: string, workflow: Partial<Workflow>): Promise<ApiResponse<Workflow>> {
    return this.request<Workflow>(`/api/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(workflow),
    });
  }

  async deleteWorkflow(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/workflows/${id}`, {
      method: 'DELETE',
    });
  }

  async duplicateWorkflow(id: string): Promise<ApiResponse<Workflow>> {
    return this.request<Workflow>(`/api/workflows/${id}/duplicate`, {
      method: 'POST',
    });
  }

  async exportWorkflow(
    id: string,
    options: { excludeApiKeys?: boolean } = { excludeApiKeys: true }
  ): Promise<ApiResponse<WorkflowExport>> {
    const params = new URLSearchParams();
    params.set('exclude_api_keys', String(options.excludeApiKeys ?? true));
    return this.request<WorkflowExport>(`/api/workflows/${id}/export?${params.toString()}`);
  }

  async importWorkflow(data: WorkflowExport): Promise<ApiResponse<Workflow>> {
    return this.request<Workflow>('/api/workflows/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Execution endpoints
  async startWorkflow(
    id: string,
    data?: { nodes: any[]; connections: any[]; character: any; startNodeId?: string }
  ): Promise<ApiResponse<{ status: string }>> {
    return this.request<{ status: string }>(`/api/workflows/${id}/start`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async stopWorkflow(id: string): Promise<ApiResponse<{ status: string }>> {
    return this.request<{ status: string }>(`/api/workflows/${id}/stop`, {
      method: 'POST',
    });
  }

  async getWorkflowStatus(id: string): Promise<ApiResponse<{ workflowId: string; status: string; startedAt: string | null; error: string | null }>> {
    return this.request(`/api/workflows/${id}/status`);
  }

  async validateWorkflow(
    id: string,
    data?: { nodes: any[]; connections: any[] }
  ): Promise<ApiResponse<ValidationResult>> {
    return this.request<ValidationResult>(`/api/workflows/${id}/validate`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // Plugin endpoints
  async listPlugins(): Promise<ApiResponse<PluginManifest[]>> {
    return this.request<PluginManifest[]>('/api/plugins');
  }

  async getPlugin(id: string): Promise<ApiResponse<PluginManifest>> {
    return this.request<PluginManifest>(`/api/plugins/${id}`);
  }

  // Template endpoints
  async listTemplates(): Promise<ApiResponse<TemplateSummary[]>> {
    return this.request<TemplateSummary[]>('/api/templates');
  }

  async getTemplate(id: string): Promise<ApiResponse<Template>> {
    return this.request<Template>(`/api/templates/${id}`);
  }

  // VOICEVOX integration
  async getVoicevoxSpeakers(
    host: string = 'http://localhost:50021'
  ): Promise<ApiResponse<{ speakers: VoicevoxSpeaker[] }>> {
    return this.request<{ speakers: VoicevoxSpeaker[] }>(
      `/api/integrations/voicevox/speakers?host=${encodeURIComponent(host)}`
    );
  }

  async checkVoicevoxHealth(
    host: string = 'http://localhost:50021'
  ): Promise<ApiResponse<{ status: string; version?: string }>> {
    return this.request<{ status: string; version?: string }>(
      `/api/integrations/voicevox/health?host=${encodeURIComponent(host)}`
    );
  }

  // Model upload endpoints
  async uploadModel(file: File): Promise<ApiResponse<ModelUploadResult>> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${this.baseUrl}/api/integrations/models/upload`, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - browser will set it with boundary
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        return { error: error.detail || `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      return { error: getErrorMessage(error, 'Upload failed') };
    }
  }

  async listModels(): Promise<ApiResponse<{ models: ModelInfo[] }>> {
    return this.request<{ models: ModelInfo[] }>('/api/integrations/models');
  }

  async deleteModel(filename: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/api/integrations/models/${filename}`, {
      method: 'DELETE',
    });
  }

  // Animation upload endpoints
  async uploadAnimation(file: File): Promise<ApiResponse<AnimationUploadResult>> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${this.baseUrl}/api/integrations/animations/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        return { error: error.detail || `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      return { error: getErrorMessage(error, 'Upload failed') };
    }
  }

  async listAnimations(): Promise<ApiResponse<{ animations: AnimationInfo[] }>> {
    return this.request<{ animations: AnimationInfo[] }>('/api/integrations/animations');
  }

  async deleteAnimation(filename: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/api/integrations/animations/${filename}`, {
      method: 'DELETE',
    });
  }

  // Global settings endpoints
  async getSettings(): Promise<ApiResponse<Record<string, string>>> {
    return this.request<Record<string, string>>('/api/settings');
  }

  async updateSettings(settings: Record<string, string>): Promise<ApiResponse<{ success: boolean }>> {
    return this.request<{ success: boolean }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }
}

export interface TemplateSummary {
  id: string;
  name: string;
  name_ja?: string;
  description: string;
  description_ja?: string;
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
  name_ja?: string;
  description: string;
  description_ja?: string;
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

export interface ValidationIssue {
  nodeId: string;
  nodeName: string;
  level: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  issues: ValidationIssue[];
}

export const api = new ApiClient(API_BASE);
export default api;
