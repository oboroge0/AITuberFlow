import { create } from 'zustand';
import api from '@/lib/api';

interface SettingsStore {
  settings: Record<string, string>;
  loaded: boolean;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: Record<string, string>) => Promise<boolean>;
  getSetting: (key: string) => string | undefined;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: {},
  loaded: false,

  fetchSettings: async () => {
    const res = await api.getSettings();
    if (res.data) {
      set({ settings: res.data, loaded: true });
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
