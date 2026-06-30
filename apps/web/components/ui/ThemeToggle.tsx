'use client';

import React from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useTranslation } from '@/stores/localeStore';

/** Toggle between light and dark themes. Persists via themeStore. */
export default function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={`px-3 py-2 rounded-lg text-fg-muted text-sm transition-colors hover:bg-hover ${className ?? ''}`}
      title={isDark ? t('theme.toLight') : t('theme.toDark')}
      aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      )}
    </button>
  );
}
