'use client';

import React, { useEffect, useState } from 'react';
import { ensureDevPortResolved } from '@/lib/runtimeEndpoints';
import { useTranslation } from '@/stores/localeStore';

const DISMISS_KEY = 'aituber-flow-port-notice-dismissed';

/**
 * Bottom-fixed notice shown when the backend auto-switched off its default
 * port (8001). Dev-mode only: `ensureDevPortResolved()` resolves immediately
 * with `switched: false` in production/desktop, so this renders nothing there.
 *
 * Styling mirrors AnnouncementBanner's `info` palette (theme-aware tokens,
 * text + color only, no icons). Dismissal is remembered for the session only.
 */
export default function PortSwitchNotice() {
  const { t } = useTranslation();
  const [port, setPort] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let active = true;
    ensureDevPortResolved().then((info) => {
      if (!active) return;
      if (info.switched) {
        setPort(info.port);
        try {
          setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
        } catch {
          setDismissed(false);
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (port === null || dismissed) return null;

  const message = t('portNotice.message').replace('{port}', String(port));

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,32rem)] px-2">
      <div
        className="bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-500/50
          rounded-lg px-4 py-3 flex items-start gap-3 shadow-lg"
      >
        <p className="flex-1 min-w-0 text-sm text-blue-800 dark:text-blue-300">{message}</p>
        <button
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem(DISMISS_KEY, '1');
            } catch {
              // ignore
            }
          }}
          aria-label={t('common.close')}
          className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center
            text-fg-faint hover:text-fg hover:bg-hover transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
