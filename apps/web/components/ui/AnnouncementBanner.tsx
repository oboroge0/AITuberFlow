'use client';

import React from 'react';
import { useAnnouncementStore, filterVisibleAnnouncements } from '@/stores/announcementStore';
import { useTranslation } from '@/stores/localeStore';

const typeStyles: Record<string, { bg: string; border: string; text: string }> = {
  critical: {
    bg: 'bg-red-900/40',
    border: 'border-red-500/50',
    text: 'text-red-300',
  },
  warning: {
    bg: 'bg-yellow-900/40',
    border: 'border-yellow-500/50',
    text: 'text-yellow-300',
  },
  info: {
    bg: 'bg-blue-900/40',
    border: 'border-blue-500/50',
    text: 'text-blue-300',
  },
};

export default function AnnouncementBanner() {
  const { locale, t } = useTranslation();
  const announcements = useAnnouncementStore((s) => s.announcements);
  const dismissedIds = useAnnouncementStore((s) => s.dismissedIds);
  const dismiss = useAnnouncementStore((s) => s.dismiss);

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
  const visible = filterVisibleAnnouncements(announcements, dismissedIds, appVersion);

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {visible.map((announcement) => {
        const styles = typeStyles[announcement.type] || typeStyles.info;
        const title =
          (locale === 'ja' ? announcement.title.ja : announcement.title.en) ||
          announcement.title.en;
        const message =
          (locale === 'ja' ? announcement.message.ja : announcement.message.en) ||
          announcement.message.en;

        return (
          <div
            key={announcement.id}
            className={`${styles.bg} ${styles.border} border rounded-lg px-4 py-3 flex items-start gap-3`}
          >
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${styles.text}`}>{title}</p>
              <p className="text-sm text-white/70 mt-0.5">{message}</p>
            </div>
            <button
              onClick={() => dismiss(announcement.id)}
              aria-label={t('common.close')}
              className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center
                text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
