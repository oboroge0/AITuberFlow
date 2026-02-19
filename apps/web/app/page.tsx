'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api, { TemplateSummary, WorkflowExport } from '@/lib/api';
import { Workflow } from '@/lib/types';
import { useTranslation } from '@/stores/localeStore';
import { toast } from '@/stores/toastStore';
import UpdateModal from '@/components/ui/UpdateModal';
import AnnouncementBanner from '@/components/ui/AnnouncementBanner';
import {
  useAnnouncementStore,
  fetchAnnouncements,
} from '@/stores/announcementStore';

type TauriInternals = {
  invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

export default function HomePage() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    body?: string;
  } | null>(null);
  const updateObjRef = useRef<unknown>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleteConfirmTimerRef = useRef<NodeJS.Timeout | null>(null);
  const setAnnouncements = useAnnouncementStore((s) => s.setAnnouncements);

  const getTauriInternals = () =>
    (window as Window & { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    return () => {
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current);
      }
    };
  }, []);

  // Fetch announcements (web + desktop)
  useEffect(() => {
    fetchAnnouncements().then((data) => {
      if (data !== null) setAnnouncements(data);
    });
  }, [setAnnouncements]);

  // Check for updates (desktop only)
  useEffect(() => {
    const tauri = getTauriInternals();
    if (typeof tauri?.invoke !== 'function') return;

    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update) {
          updateObjRef.current = update;
          setUpdateInfo({
            version: update.version,
            body: update.body || undefined,
          });
        }
      } catch (err) {
        console.warn('[updater] check failed:', err);
      }
    })();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [workflowsRes, templatesRes] = await Promise.all([
      api.listWorkflows(),
      api.listTemplates(),
    ]);

    if (workflowsRes.data) {
      setWorkflows(workflowsRes.data);
    } else if (workflowsRes.error) {
      setError(workflowsRes.error);
    }

    if (templatesRes.data) {
      setTemplates(templatesRes.data);
    }

    setLoading(false);
  };

  const createNewWorkflow = async () => {
    const response = await api.createWorkflow({
      name: 'New Workflow',
      nodes: [],
      connections: [],
      character: {
        name: 'AI Assistant',
        personality: 'Friendly and helpful',
      },
    });

    if (response.data) {
      router.push(`/editor/${response.data.id}`);
    } else if (response.error) {
      setError(response.error);
    }
  };

  const createFromTemplate = async (templateId: string) => {
    const templateRes = await api.getTemplate(templateId);
    if (!templateRes.data) {
      setError(templateRes.error || 'Failed to load template');
      return;
    }

    const template = templateRes.data;
    const response = await api.createWorkflow({
      name: template.name,
      nodes: template.nodes,
      connections: template.connections,
      character: template.character,
    });

    if (response.data) {
      router.push(`/editor/${response.data.id}`);
    } else if (response.error) {
      setError(response.error);
    }
  };

  const deleteWorkflow = async (id: string) => {
    const tauri = getTauriInternals();
    const isDesktop = typeof tauri?.invoke === 'function';
    if (isDesktop) {
      if (pendingDeleteId !== id) {
        setPendingDeleteId(id);
        toast.warning('もう一度押すと削除します');
        if (deleteConfirmTimerRef.current) {
          clearTimeout(deleteConfirmTimerRef.current);
        }
        deleteConfirmTimerRef.current = setTimeout(() => {
          setPendingDeleteId(null);
          deleteConfirmTimerRef.current = null;
        }, 5000);
        return;
      }
    } else if (!confirm(t('home.deleteConfirm'))) {
      return;
    }

    const response = await api.deleteWorkflow(id);
    if (response.error) {
      setError(response.error);
    } else {
      setWorkflows(workflows.filter((w) => w.id !== id));
      setPendingDeleteId(null);
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current);
        deleteConfirmTimerRef.current = null;
      }
      toast.success('ワークフローを削除しました');
    }
  };

  const duplicateWorkflow = async (id: string) => {
    const response = await api.duplicateWorkflow(id);
    if (response.data) {
      setWorkflows([response.data, ...workflows]);
    } else if (response.error) {
      setError(response.error);
    }
  };

  const exportWorkflow = async (id: string, name: string) => {
    const response = await api.exportWorkflow(id);
    if (response.data) {
      const jsonText = JSON.stringify(response.data, null, 2);
      const safeName = `${name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'workflow'}.json`;
      const tauri = getTauriInternals();

      if (typeof tauri?.invoke === 'function') {
        try {
          const savedPath = await tauri.invoke('save_workflow_export', {
            filename: safeName,
            content: jsonText,
          });
          toast.success(`保存しました: ${String(savedPath)}`);
        } catch (invokeError) {
          setError(invokeError instanceof Error ? invokeError.message : '保存に失敗しました');
        }
        return;
      }

      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('ワークフローをダウンロードしました');
    } else if (response.error) {
      setError(response.error);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const importData = JSON.parse(text) as any;
      // Handle both wrapped format { workflow: {...} } and flat format { name, nodes, ... }
      const workflow = (importData.workflow || importData) as WorkflowExport | undefined;

      if (!workflow || !workflow.nodes || !Array.isArray(workflow.nodes)) {
        throw new Error('Invalid workflow file');
      }

      const importPayload: WorkflowExport = {
        name: workflow.name || 'Imported Workflow',
        description: workflow.description,
        nodes: workflow.nodes,
        connections: workflow.connections || [],
        character: workflow.character || { name: 'AI Assistant', personality: 'Friendly and helpful' },
      };

      const response = await api.importWorkflow(importPayload);
      if (response.data) {
        router.push(`/editor/${response.data.id}`);
      } else if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON file');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
      }}
    >
      {/* Grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex-shrink-0 border-b border-white/10" style={{ background: 'rgba(17, 24, 39, 0.8)' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[10px] overflow-hidden flex items-center justify-center"
              style={{
                boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)',
              }}
            >
              <img
                src="/logo.png"
                alt="AITuberFlow logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1
                className="text-xl font-bold m-0"
                style={{
                  background: 'linear-gradient(135deg, #10B981, #3B82F6)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {t('home.title')}
              </h1>
              <p className="text-xs text-white/50 m-0">{t('home.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Language switcher */}
            <button
              onClick={() => setLocale(locale === 'ja' ? 'en' : 'ja')}
              className="px-3 py-2 rounded-lg text-white/60 text-sm transition-colors hover:bg-white/10"
              title={locale === 'ja' ? 'Switch to English' : '日本語に切替'}
            >
              {locale === 'ja' ? 'EN' : 'JA'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg text-white/80 font-medium text-sm flex items-center gap-2 transition-colors hover:bg-white/10"
              style={{ border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {t('home.import')}
            </button>
            <button
              onClick={createNewWorkflow}
              className="px-4 py-2 rounded-lg text-white font-semibold text-sm flex items-center gap-2 transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {t('home.newWorkflow')}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 pb-24">
        <AnnouncementBanner />
        {loading ? (
          <div className="text-center py-12">
            <div
              className="w-8 h-8 rounded-full mx-auto animate-spin"
              style={{ border: '2px solid #10B981', borderTopColor: 'transparent' }}
            />
            <p className="text-gray-400 mt-4">{t('home.loading')}</p>
          </div>
        ) : error ? (
          <div
            className="text-center py-12 rounded-2xl border border-white/10"
            style={{ background: 'rgba(17, 24, 39, 0.8)' }}
          >
            <p className="text-red-400 mb-4">{error}</p>
            <p className="text-gray-500 text-sm">
              {t('home.serverError')}
            </p>
            <button
              onClick={loadData}
              className="mt-4 px-4 py-2 rounded-lg text-[#10B981] text-sm transition-colors hover:bg-white/5"
              style={{ border: '1px solid #10B981' }}
            >
              {t('home.retry')}
            </button>
          </div>
        ) : (
          <>
            {/* Templates Section */}
            {templates.length > 0 && (
              <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                  </svg>
                  {t('home.templates')}
                </h2>
                <p className="text-gray-400 text-sm mb-4">{t('home.templatesDesc')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((template) => {
                    const templateName = locale === 'ja' && template.name_ja ? template.name_ja : template.name;
                    const templateDesc = locale === 'ja' && template.description_ja ? template.description_ja : template.description;
                    return (
                    <button
                      key={template.id}
                      onClick={() => createFromTemplate(template.id)}
                      className="text-left rounded-xl border border-white/10 p-4 transition-all hover:border-[#10B981]/50 hover:bg-white/5 group"
                      style={{ background: 'rgba(17, 24, 39, 0.6)' }}
                    >
                      <div className="flex items-start justify-between">
                        <h3 className="text-lg font-semibold text-white group-hover:text-[#10B981] transition-colors">
                          {templateName}
                        </h3>
                        <svg
                          className="text-gray-500 group-hover:text-[#10B981] transition-colors mt-1"
                          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        >
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </div>
                      <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                        {templateDesc}
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                          </svg>
                          {template.nodeCount} {t('home.nodes')}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                          </svg>
                          {template.connectionCount} {t('home.connections')}
                        </span>
                      </div>
                    </button>
                  );
                  })}
                </div>
              </section>
            )}

            {/* Workflows Section */}
            <section>
              <h2 className="text-2xl font-semibold text-white mb-6">{t('home.yourWorkflows')}</h2>

              {workflows.length === 0 ? (
                <div
                  className="text-center py-12 rounded-2xl border border-white/10"
                  style={{ background: 'rgba(17, 24, 39, 0.8)' }}
                >
                  <div
                    className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(16, 185, 129, 0.1)' }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{t('home.noWorkflows')}</h3>
                  <p className="text-gray-400 mb-6 max-w-md mx-auto">
                    {t('home.noWorkflowsDesc')}
                  </p>
                  <button
                    onClick={createNewWorkflow}
                    className="px-6 py-3 rounded-lg text-white font-semibold transition-opacity hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                  >
                    {t('home.createFirst')}
                  </button>
                </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {workflows.map((workflow) => (
                    <div
                      key={workflow.id}
                      className="rounded-xl border border-white/10 overflow-hidden transition-all hover:border-[#10B981]/50 group"
                      style={{ background: 'rgba(17, 24, 39, 0.8)' }}
                    >
                      <Link href={`/editor/${workflow.id}`} className="block p-4">
                        <h3 className="text-lg font-semibold text-white group-hover:text-[#10B981] transition-colors">
                          {workflow.name}
                        </h3>
                        {workflow.description && (
                          <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                            {workflow.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="3" width="18" height="18" rx="2"/>
                            </svg>
                            {workflow.nodes?.length || 0} {t('home.nodes')}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                            </svg>
                            {workflow.connections?.length || 0} {t('home.connections')}
                          </span>
                        </div>
                      </Link>
                      <div className="px-4 py-2 border-t border-white/10 flex justify-between items-center">
                        <span className="text-xs text-gray-600">
                          {new Date(workflow.updatedAt).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => duplicateWorkflow(workflow.id)}
                            className="text-xs text-gray-400 hover:text-[#10B981] transition-colors"
                            title="Duplicate"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2"/>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => exportWorkflow(workflow.id, workflow.name)}
                            className="text-xs text-gray-400 hover:text-[#3B82F6] transition-colors"
                            title="Export"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/>
                              <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteWorkflow(workflow.id)}
                            className={`text-xs transition-colors ${
                              pendingDeleteId === workflow.id
                                ? 'text-red-400'
                                : 'text-gray-400 hover:text-red-400'
                            }`}
                            title={pendingDeleteId === workflow.id ? 'Click again to delete' : 'Delete'}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    ))}
                  </div>
              )}
            </section>
          </>
        )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 flex-shrink-0 border-t border-white/10 py-4" style={{ background: 'rgba(17, 24, 39, 0.8)' }}>
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-400">
          <p>{t('support.description')}</p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/oboroge0/AITuberFlow/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-[#10B981] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              {t('support.issue')}
            </a>
            <a
              href="https://x.com/oboroge9"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-[#10B981] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              {t('support.dm')} (@oboroge9)
            </a>
            <span className="text-gray-600">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
          </div>
        </div>
      </footer>

      {/* Update modal (desktop only) */}
      {updateInfo != null && !updateDismissed && updateObjRef.current != null ? (
        <UpdateModal
          updateInfo={updateInfo}
          updateObj={updateObjRef.current}
          onClose={() => setUpdateDismissed(true)}
        />
      ) : null}
    </div>
  );
}
