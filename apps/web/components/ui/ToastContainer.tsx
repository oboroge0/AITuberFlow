'use client';

import React from 'react';
import { useToastStore, Toast, ToastType } from '@/stores/toastStore';

const typeStyles: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'bg-green-900/90',
    border: 'border-green-500/50',
    icon: '✓',
  },
  error: {
    bg: 'bg-red-900/90',
    border: 'border-red-500/50',
    icon: '✕',
  },
  warning: {
    bg: 'bg-yellow-900/90',
    border: 'border-yellow-500/50',
    icon: '⚠',
  },
  info: {
    bg: 'bg-blue-900/90',
    border: 'border-blue-500/50',
    icon: 'ℹ',
  },
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((state) => state.removeToast);
  const styles = typeStyles[toast.type];

  return (
    <div
      className={`
        ${styles.bg} ${styles.border}
        border rounded-lg shadow-lg backdrop-blur-sm
        px-4 py-3 flex items-center gap-3
        animate-slide-in-right
        max-w-sm
      `}
    >
      <span className="text-lg flex-shrink-0">{styles.icon}</span>
      <p className="text-white text-sm flex-1">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        aria-label="通知を閉じる"
        className="text-white/60 hover:text-white transition-colors flex-shrink-0"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
