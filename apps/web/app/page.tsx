'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api, { TemplateSummary, WorkflowExport } from '@/lib/api';
import { Workflow } from '@/lib/types';
import { useTranslation } from '@/stores/localeStore';

export default function HomePage() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
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
    if (!confirm(t('home.deleteConfirm'))) return;

    const response = await api.deleteWorkflow(id);
    if (!response.error) {
      setWorkflows(workflows.filter((w) => w.id !== id));
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
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
              className="w-10 h-10 rounded-[10px] flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #10B981, #3B82F6)',
                boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
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
        <div className="max-w-6xl mx-auto px-6 py-8">
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
                            className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                            title="Delete"
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
    </div>
  );
}
