import { Workflow, PluginManifest, ApiResponse } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

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
      return { error: error instanceof Error ? error.message : 'Network error' };
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

  // Execution endpoints
  async startWorkflow(
    id: string,
    data?: { nodes: any[]; connections: any[]; character: any }
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

  // Plugin endpoints
  async listPlugins(): Promise<ApiResponse<PluginManifest[]>> {
    return this.request<PluginManifest[]>('/api/plugins');
  }

  async getPlugin(id: string): Promise<ApiResponse<PluginManifest>> {
    return this.request<PluginManifest>(`/api/plugins/${id}`);
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
}

export interface VoicevoxSpeaker {
  id: number;
  name: string;
  style: string;
  label: string;
}

export const api = new ApiClient(API_BASE);
export default api;
