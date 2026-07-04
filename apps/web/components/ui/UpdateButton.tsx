'use client';

import React, { useState, useCallback } from 'react';
import { useTranslation } from '@/stores/localeStore';

type UpdateStatus = 'available' | 'downloading' | 'error';

interface DownloadEvent {
  event: string;
  data: { contentLength?: number; chunkLength?: number };
}

interface TauriUpdate {
  version: string;
  body?: string;
  downloadAndInstall: (cb?: (event: DownloadEvent) => void) => Promise<void>;
}

interface UpdateButtonProps {
  updateInfo: { version: string };
  updateObj: unknown;
}

/**
 * フッターに常設する更新ボタン（アウトライン基調・色は左の点だけの控えめデザイン）。
 * 更新があるときだけ表示され、押すとダウンロード→インストール→自動再起動する。
 * ダウンロード中はボタン自体が進捗表示に変わる（モーダルは出さない）。
 */
export default function UpdateButton({ updateInfo, updateObj }: UpdateButtonProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpdateStatus>('available');
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });

  const handleUpdate = useCallback(async () => {
    try {
      setStatus('downloading');
      setProgress({ downloaded: 0, total: 0 });

      const { relaunch } = await import('@tauri-apps/plugin-process');
      const update = updateObj as TauriUpdate;

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setProgress({ downloaded: 0, total: event.data.contentLength || 0 });
        } else if (event.event === 'Progress') {
          setProgress((prev) => ({
            ...prev,
            downloaded: prev.downloaded + (event.data.chunkLength || 0),
          }));
        }
      });
      await relaunch();
    } catch (err) {
      console.error('[updater] update failed:', err);
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateObj is stable (ref from parent)
  }, []);

  const progressPercent =
    progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : 0;

  const dotColor = status === 'error' ? '#F87171' : '#34D399';

  return (
    <button
      onClick={handleUpdate}
      disabled={status === 'downloading'}
      title={status === 'error' ? t('update.error') : t('update.restart')}
      className="px-3 py-1.5 rounded-lg text-xs font-medium leading-none whitespace-nowrap
        flex items-center gap-2 text-white/85 transition-colors hover:bg-white/5
        disabled:cursor-default disabled:hover:bg-transparent"
      style={{ border: '1px solid rgba(255,255,255,0.18)' }}
    >
      <span
        className="inline-flex rounded-full h-1.5 w-1.5 flex-shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      {status === 'downloading' ? (
        `${t('update.downloading')} ${progressPercent}%`
      ) : status === 'error' ? (
        t('update.retry')
      ) : (
        <>
          {t('update.restart')}
          <span className="text-[10px] text-white/45">v{updateInfo.version}</span>
        </>
      )}
    </button>
  );
}
