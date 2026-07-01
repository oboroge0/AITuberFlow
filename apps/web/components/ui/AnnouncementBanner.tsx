'use client';

import React from 'react';
import { useAnnouncementStore, filterVisibleAnnouncements } from '@/stores/announcementStore';
import { useTranslation } from '@/stores/localeStore';

const typeStyles: Record<string, { bg: string; border: string; text: string }> = {
  critical: {
    bg: 'bg-red-100 dark:bg-red-900/40',
    border: 'border-red-300 dark:border-red-500/50',
    text: 'text-red-800 dark:text-red-300',
  },
  warning: {
    bg: 'bg-amber-100 dark:bg-yellow-900/40',
    border: 'border-amber-300 dark:border-yellow-500/50',
    text: 'text-amber-800 dark:text-yellow-300',
  },
  info: {
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    border: 'border-blue-300 dark:border-blue-500/50',
    text: 'text-blue-800 dark:text-blue-300',
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
              <p className="text-sm text-fg-muted mt-0.5">{message}</p>
            </div>
            <button
              onClick={() => dismiss(announcement.id)}
              aria-label={t('common.close')}
              className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center
                text-fg-faint hover:text-fg hover:bg-hover transition-colors"
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
