import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Announcement {
  id: string;
  type: 'info' | 'warning' | 'critical';
  title: { ja: string; en: string };
  message: { ja: string; en: string };
  targetVersions?: string[];
  date: string;
}

interface AnnouncementState {
  announcements: Announcement[];
  dismissedIds: string[];
  setAnnouncements: (announcements: Announcement[]) => void;
  dismiss: (id: string) => void;
  getVisible: (version: string) => Announcement[];
}

const ANNOUNCEMENTS_URL =
  'https://raw.githubusercontent.com/oboroge0/AITuberFlow/main/announcements.json';

export const useAnnouncementStore = create<AnnouncementState>()(
  persist(
    (set, get) => ({
      announcements: [],
      dismissedIds: [],

      setAnnouncements: (announcements) => set({ announcements }),

      dismiss: (id) =>
        set((state) => ({
          dismissedIds: [...state.dismissedIds, id],
        })),

      getVisible: (version) => {
        const { announcements, dismissedIds } = get();
        return announcements.filter((a) => {
          if (dismissedIds.includes(a.id)) return false;
          if (a.targetVersions && a.targetVersions.length > 0) {
            if (!a.targetVersions.includes(version)) return false;
          }
          return true;
        });
      },
    }),
    {
      name: 'aituber-flow-announcements',
      partialize: (state) => ({ dismissedIds: state.dismissedIds }),
    }
  )
);

export async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const response = await fetch(ANNOUNCEMENTS_URL, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}
