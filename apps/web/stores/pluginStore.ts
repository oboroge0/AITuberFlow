import { create } from 'zustand';
import { PluginManifest, CategoryDefinition, PluginCategory } from '@/lib/types';

// Default categories (fallback if API fails)
const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { id: 'control', label: '制御フロー', labelEn: 'Control Flow', order: 1 },
  { id: 'input', label: '入力', labelEn: 'Input', order: 2 },
  { id: 'llm', label: 'LLM', labelEn: 'LLM', order: 3 },
  { id: 'tts', label: '音声合成', labelEn: 'TTS', order: 4 },
  { id: 'avatar', label: 'アバター', labelEn: 'Avatar', order: 5 },
  { id: 'output', label: '出力', labelEn: 'Output', order: 6 },
  { id: 'utility', label: 'ユーティリティ', labelEn: 'Utility', order: 7 },
  { id: 'obs', label: 'OBS', labelEn: 'OBS', order: 8 },
];

interface PluginState {
  // Data
  plugins: PluginManifest[];
  categories: CategoryDefinition[];

  // Status
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;

  // Actions
  fetchPlugins: () => Promise<void>;
  getPluginById: (id: string) => PluginManifest | undefined;
  getPluginsByCategory: (category: PluginCategory) => PluginManifest[];
  getPluginLabel: (id: string) => string;
  getPluginColor: (id: string) => string;
  getPluginBgColor: (id: string) => string;
  getPluginIcon: (id: string) => string;
  getPluginInputs: (id: string) => PluginManifest['node']['inputs'];
  getPluginOutputs: (id: string) => PluginManifest['node']['outputs'];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

export const usePluginStore = create<PluginState>((set, get) => ({
  plugins: [],
  categories: DEFAULT_CATEGORIES,
  isLoading: false,
  isLoaded: false,
  error: null,

  fetchPlugins: async () => {
    // Skip if already loaded
    if (get().isLoaded) return;

    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_BASE}/api/plugins`);
      if (!response.ok) {
        throw new Error(`Failed to fetch plugins: ${response.status}`);
      }

      const plugins: PluginManifest[] = await response.json();

      set({
        plugins,
        isLoading: false,
        isLoaded: true,
        error: null,
      });
    } catch (error) {
      console.error('Failed to fetch plugins:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  getPluginById: (id: string) => {
    return get().plugins.find((p) => p.id === id);
  },

  getPluginsByCategory: (category: PluginCategory) => {
    return get().plugins.filter((p) => p.category === category);
  },

  getPluginLabel: (id: string) => {
    const plugin = get().getPluginById(id);
    return plugin?.ui?.label ?? plugin?.name ?? id;
  },

  getPluginColor: (id: string) => {
    const plugin = get().getPluginById(id);
    return plugin?.ui?.color ?? '#6B7280';
  },

  getPluginBgColor: (id: string) => {
    const plugin = get().getPluginById(id);
    return plugin?.ui?.bgColor ?? 'rgba(107, 114, 128, 0.1)';
  },

  getPluginIcon: (id: string) => {
    const plugin = get().getPluginById(id);
    return plugin?.ui?.icon ?? 'Box';
  },

  getPluginInputs: (id: string) => {
    const plugin = get().getPluginById(id);
    return plugin?.node?.inputs ?? [];
  },

  getPluginOutputs: (id: string) => {
    const plugin = get().getPluginById(id);
    return plugin?.node?.outputs ?? [];
  },
}));
