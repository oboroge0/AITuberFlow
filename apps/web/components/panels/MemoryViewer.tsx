'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import api, { WorkflowMemory } from '@/lib/api';
import { toast } from '@/stores/toastStore';
import { useTranslation } from '@/stores/localeStore';

interface MemoryViewerProps {
  workflowId: string;
  onClose: () => void;
}

const DELETE_ALL_CONFIRM_TIMEOUT_MS = 5000;
const LIST_LIMIT = 100;

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export default function MemoryViewer({ workflowId, onClose }: MemoryViewerProps) {
  const { t } = useTranslation();

  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [memoriesList, setMemoriesList] = useState<WorkflowMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false);
  const deleteAllTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [addingTable, setAddingTable] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [creatingTable, setCreatingTable] = useState(false);

  const loadTables = useCallback(async () => {
    const response = await api.listMemoryTables(workflowId);
    if (response.data) {
      setTables(response.data);
    } else if (response.error) {
      toast.error(t('memories.loadTablesError') + response.error);
    }
  }, [workflowId, t]);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    const response = await api.listMemories(workflowId, {
      tableName: selectedTable || undefined,
      limit: LIST_LIMIT,
    });
    if (response.data) {
      setMemoriesList(response.data);
    } else if (response.error) {
      toast.error(t('memories.loadError') + response.error);
    }
    setLoading(false);
  }, [workflowId, selectedTable, t]);

  const refresh = useCallback(() => {
    loadTables();
    loadMemories();
  }, [loadTables, loadMemories]);

  const handleCreateTable = async () => {
    const name = newTableName.trim();
    if (!name) {
      toast.warning(t('memories.tableNameRequired'));
      return;
    }

    setCreatingTable(true);
    const response = await api.createMemoryTable(workflowId, name);
    setCreatingTable(false);

    if (response.error) {
      toast.error(t('memories.createTableError') + response.error);
      return;
    }

    toast.success(t('memories.createTableSuccess'));
    setNewTableName('');
    setAddingTable(false);
    setSelectedTable(response.data?.name ?? name);
    await loadTables();
  };

  // Initial load + reload when the panel is opened for a different workflow
  useEffect(() => {
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // Reload memories whenever the table filter (or workflow) changes
  useEffect(() => {
    loadMemories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, selectedTable]);

  // Escape key closes the panel, matching other overlay panels in the editor
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Clean up the pending delete-all confirmation timer on unmount
  useEffect(() => {
    return () => {
      if (deleteAllTimerRef.current) clearTimeout(deleteAllTimerRef.current);
    };
  }, []);

  const handleDeleteOne = async (id: string) => {
    setDeletingId(id);
    const response = await api.deleteMemory(workflowId, id);
    setDeletingId(null);

    if (response.error) {
      toast.error(t('memories.deleteError') + response.error);
      return;
    }

    setMemoriesList((prev) => prev.filter((m) => m.id !== id));
    toast.success(t('memories.deleteSuccess'));
  };

  // Two-click confirmation, matching the delete-workflow pattern used on the home page
  const handleDeleteAll = async () => {
    if (!pendingDeleteAll) {
      setPendingDeleteAll(true);
      toast.warning(t('memories.deleteAllConfirm'));
      if (deleteAllTimerRef.current) clearTimeout(deleteAllTimerRef.current);
      deleteAllTimerRef.current = setTimeout(() => {
        setPendingDeleteAll(false);
        deleteAllTimerRef.current = null;
      }, DELETE_ALL_CONFIRM_TIMEOUT_MS);
      return;
    }

    if (deleteAllTimerRef.current) {
      clearTimeout(deleteAllTimerRef.current);
      deleteAllTimerRef.current = null;
    }
    setPendingDeleteAll(false);

    const response = await api.deleteAllMemories(workflowId, selectedTable || undefined);
    if (response.error) {
      toast.error(t('memories.deleteAllError') + response.error);
      return;
    }

    toast.success(t('memories.deleteAllSuccess'));
    refresh();
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-2xl mx-4 rounded-2xl border border-token-border overflow-hidden max-h-[85vh] flex flex-col"
        style={{
          background: 'var(--surface-strong)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{
            background: 'var(--border-subtle)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(6, 182, 212, 0.2)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.5a2.5 2.5 0 0 0-1.96 2.4c0 .38.08.75.22 1.08A2.5 2.5 0 0 0 4 11c0 .8.36 1.52.94 2V14a2.5 2.5 0 0 0 2.5 2.5c.19 0 .38-.02.56-.06V19a2 2 0 1 0 4 0V4.5A2.5 2.5 0 0 0 9.5 2z" />
                <path d="M14.5 2A2.5 2.5 0 0 1 17 4.5v.5a2.5 2.5 0 0 1 1.96 2.4c0 .38-.08.75-.22 1.08A2.5 2.5 0 0 1 20 11c0 .8-.36 1.52-.94 2V14a2.5 2.5 0 0 1-2.5 2.5c-.19 0-.38-.02-.56-.06V19a2 2 0 1 1-4 0V4.5A2.5 2.5 0 0 1 14.5 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-fg">{t('memories.title')}</h2>
              <p className="text-xs text-fg-dim">{t('memories.description')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-fg-dim hover:text-fg hover:bg-hover transition-colors"
            aria-label={t('memories.close')}
            title={t('memories.close')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Toolbar: table filter + refresh + delete all */}
        <div
          className="px-6 py-3 flex items-center gap-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm text-fg outline-none"
            style={{ background: 'var(--elevated)', border: '1px solid var(--border)' }}
            aria-label={t('memories.table')}
          >
            <option value="">{t('memories.allTables')}</option>
            {tables.map((tableName) => (
              <option key={tableName} value={tableName}>
                {tableName}
              </option>
            ))}
          </select>

          <button
            onClick={() => setAddingTable((prev) => !prev)}
            className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-fg-dim hover:text-fg hover:bg-hover transition-colors"
            title={t('memories.addTable')}
            aria-label={t('memories.addTable')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {!loading && (
            <span className="text-xs text-fg-faint whitespace-nowrap">
              {memoriesList.length} {t('memories.itemCount')}
            </span>
          )}

          <div className="flex-1" />

          <button
            onClick={refresh}
            className="px-3 py-1.5 rounded-lg text-xs text-fg-muted hover:bg-hover transition-colors flex items-center gap-1.5"
            title={t('memories.refresh')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {t('memories.refresh')}
          </button>

          <button
            onClick={handleDeleteAll}
            disabled={memoriesList.length === 0 && !pendingDeleteAll}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
              pendingDeleteAll
                ? 'bg-red-500/20 text-red-400'
                : 'text-fg-muted hover:text-red-400 hover:bg-hover'
            }`}
            title={pendingDeleteAll ? t('memories.deleteAllConfirm') : t('memories.deleteAll')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {t('memories.deleteAll')}
          </button>
        </div>

        {/* Inline "create table" row */}
        {addingTable && (
          <div
            className="px-6 py-3 flex items-center gap-2 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <input
              type="text"
              autoFocus
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTable();
                if (e.key === 'Escape') {
                  setAddingTable(false);
                  setNewTableName('');
                }
              }}
              placeholder={t('memories.newTablePlaceholder')}
              className="flex-1 px-3 py-1.5 rounded-lg text-sm text-fg outline-none"
              style={{ background: 'var(--elevated)', border: '1px solid var(--border)' }}
            />
            <button
              onClick={handleCreateTable}
              disabled={creatingTable}
              className="px-3 py-1.5 rounded-lg text-xs text-emerald-400 hover:bg-hover transition-colors disabled:opacity-40"
            >
              {t('memories.createTable')}
            </button>
            <button
              onClick={() => {
                setAddingTable(false);
                setNewTableName('');
              }}
              className="px-3 py-1.5 rounded-lg text-xs text-fg-muted hover:bg-hover transition-colors"
            >
              {t('memories.cancel')}
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-[240px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-token-border border-t-cyan-400 animate-spin" />
              <span className="text-xs text-fg-faint">{t('memories.loading')}</span>
            </div>
          ) : memoriesList.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-sm text-fg-faint">
                {selectedTable ? t('memories.emptyFiltered') : t('memories.empty')}
              </span>
            </div>
          ) : (
            memoriesList.map((memory) => (
              <div
                key={memory.id}
                className="px-6 py-3 flex items-start gap-3 border-b border-token-border-subtle hover:bg-hover transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{ background: 'var(--elevated)', color: 'var(--text-muted)' }}
                    >
                      {memory.tableName}
                    </span>
                    <span className="text-[10px] text-fg-faint font-mono">
                      {formatTimestamp(memory.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-fg-muted line-clamp-2 break-words whitespace-pre-wrap">
                    {memory.content}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteOne(memory.id)}
                  disabled={deletingId === memory.id}
                  className="text-fg-faint hover:text-red-400 transition-colors p-1 flex-shrink-0 disabled:opacity-40"
                  title={t('memories.delete')}
                  aria-label={t('memories.delete')}
                >
                  {deletingId === memory.id ? (
                    <div
                      className="w-3.5 h-3.5 rounded-full animate-spin"
                      style={{ border: '2px solid currentColor', borderTopColor: 'transparent' }}
                    />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
