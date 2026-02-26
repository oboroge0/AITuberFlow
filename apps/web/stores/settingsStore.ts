import { create } from 'zustand';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/errorHandler';

interface SettingsStore {
  settings: Record<string, string>;
  loaded: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: Record<string, string>) => Promise<boolean>;
  getSetting: (key: string) => string | undefined;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: {},
  loaded: false,
  error: null,

  fetchSettings: async () => {
    try {
      const res = await api.getSettings();
      if (res.data) {
        set({ settings: res.data, loaded: true, error: null });
      } else {
        set({ loaded: true, error: res.error || 'Failed to fetch settings' });
      }
    } catch (e) {
      set({ loaded: true, error: getErrorMessage(e, 'Failed to fetch settings') });
    }
  },

  updateSettings: async (newSettings) => {
    const res = await api.updateSettings(newSettings);
    if (res.data) {
      set((state) => ({
        settings: { ...state.settings, ...newSettings },
      }));
      return true;
    }
    return false;
  },

  getSetting: (key) => {
    return get().settings[key];
  },
}));
