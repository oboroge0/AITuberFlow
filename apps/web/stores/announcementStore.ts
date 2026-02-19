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

export function filterVisibleAnnouncements(
  announcements: Announcement[],
  dismissedIds: string[],
  version: string
): Announcement[] {
  return announcements.filter((a) => {
    if (dismissedIds.includes(a.id)) return false;
    if (a.targetVersions && a.targetVersions.length > 0) {
      if (!a.targetVersions.includes(version)) return false;
    }
    return true;
  });
}

export const useAnnouncementStore = create<AnnouncementState>()(
  persist(
    (set, get) => ({
      announcements: [],
      dismissedIds: [],

      setAnnouncements: (announcements) =>
        set((state) => ({
          announcements,
          dismissedIds: state.dismissedIds.filter((id) =>
            announcements.some((a) => a.id === id)
          ),
        })),

      dismiss: (id) =>
        set((state) => ({
          dismissedIds: [...state.dismissedIds, id],
        })),

      getVisible: (version) => {
        const { announcements, dismissedIds } = get();
        return filterVisibleAnnouncements(announcements, dismissedIds, version);
      },
    }),
    {
      name: 'aituber-flow-announcements',
      partialize: (state) => ({ dismissedIds: state.dismissedIds }),
    }
  )
);

export async function fetchAnnouncements(): Promise<Announcement[] | null> {
  try {
    const response = await fetch(ANNOUNCEMENTS_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data)) return null;
    return data.filter(
      (item): item is Announcement =>
        typeof item.id === 'string' &&
        (item.type === 'info' || item.type === 'warning' || item.type === 'critical') &&
        item.title &&
        typeof item.title.en === 'string' &&
        typeof item.title.ja === 'string' &&
        item.message &&
        typeof item.message.en === 'string' &&
        typeof item.message.ja === 'string' &&
        typeof item.date === 'string' &&
        (item.targetVersions === undefined ||
          (Array.isArray(item.targetVersions) &&
            item.targetVersions.every((v: unknown) => typeof v === 'string')))
    );
  } catch {
    return null;
  }
}
