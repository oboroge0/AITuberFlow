'use client';

import React, { useState, useCallback } from 'react';
import { useTranslation } from '@/stores/localeStore';

type UpdateStatus = 'available' | 'downloading' | 'error';

interface UpdateInfo {
  version: string;
  body?: string;
}

interface UpdateModalProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
}

export default function UpdateModal({ updateInfo, onClose }: UpdateModalProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpdateStatus>('available');
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'unknown';

  const handleUpdate = useCallback(async () => {
    try {
      setStatus('downloading');
      setErrorMessage(null);

      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');

      const update = await check();
      if (update) {
        await update.downloadAndInstall((event) => {
          if (event.event === 'Started') {
            setProgress({
              downloaded: 0,
              total: (event.data as { contentLength?: number }).contentLength || 0,
            });
          } else if (event.event === 'Progress') {
            setProgress((prev) => ({
              ...prev,
              downloaded:
                prev.downloaded +
                ((event.data as { chunkLength?: number }).chunkLength || 0),
            }));
          }
        });
        await relaunch();
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const progressPercent =
    progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={status === 'available' ? onClose : undefined}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-white/10 overflow-hidden"
        style={{
          background: 'rgba(17, 24, 39, 0.98)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{
            background: 'rgba(255,255,255,0.05)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(16, 185, 129, 0.2)' }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#10B981"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">
              {t('update.title')}
            </h2>
          </div>
          {status === 'available' && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center
                text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {status === 'available' && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-white/60">{currentVersion}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-white/40"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
                <span className="text-sm font-semibold text-[#10B981]">
                  {updateInfo.version}
                </span>
              </div>
              {updateInfo.body && (
                <div
                  className="rounded-lg p-3 text-sm text-white/70 max-h-48 overflow-y-auto whitespace-pre-wrap"
                  style={{ background: 'rgba(0,0,0,0.3)' }}
                >
                  {updateInfo.body}
                </div>
              )}
            </>
          )}

          {status === 'downloading' && (
            <div className="space-y-3">
              <p className="text-sm text-white/70">{t('update.downloading')}</p>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progressPercent}%`,
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                  }}
                />
              </div>
              <p className="text-xs text-white/40 text-center">
                {progressPercent}%
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-2">
              <p className="text-sm text-red-400">{t('update.error')}</p>
              {errorMessage && (
                <p className="text-xs text-white/40 break-all">{errorMessage}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex items-center justify-end gap-3"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {status === 'available' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-white/60 text-sm
                  hover:bg-white/10 transition-colors"
              >
                {t('update.later')}
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 rounded-lg text-white font-semibold text-sm
                  transition-opacity hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                }}
              >
                {t('update.now')}
              </button>
            </>
          )}
          {status === 'error' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-white/60 text-sm
                  hover:bg-white/10 transition-colors"
              >
                {t('update.close')}
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 rounded-lg text-white font-semibold text-sm
                  transition-opacity hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                }}
              >
                {t('update.retry')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
