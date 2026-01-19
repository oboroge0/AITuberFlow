'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api, { TemplateSummary } from '@/lib/api';
import { Workflow } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (!confirm('Delete this workflow?')) return;

    const response = await api.deleteWorkflow(id);
    if (!response.error) {
      setWorkflows(workflows.filter((w) => w.id !== id));
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
                AITuber Flow
              </h1>
              <p className="text-xs text-white/50 m-0">Visual Workflow Editor</p>
            </div>
          </div>
          <button
            onClick={createNewWorkflow}
            className="px-4 py-2 rounded-lg text-white font-semibold text-sm flex items-center gap-2 transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Workflow
          </button>
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
            <p className="text-gray-400 mt-4">Loading...</p>
          </div>
        ) : error ? (
          <div
            className="text-center py-12 rounded-2xl border border-white/10"
            style={{ background: 'rgba(17, 24, 39, 0.8)' }}
          >
            <p className="text-red-400 mb-4">{error}</p>
            <p className="text-gray-500 text-sm">
              Make sure the backend server is running at http://localhost:8001
            </p>
            <button
              onClick={loadData}
              className="mt-4 px-4 py-2 rounded-lg text-[#10B981] text-sm transition-colors hover:bg-white/5"
              style={{ border: '1px solid #10B981' }}
            >
              Retry
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
                  Templates
                </h2>
                <p className="text-gray-400 text-sm mb-4">Start quickly with a pre-built workflow</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => createFromTemplate(template.id)}
                      className="text-left rounded-xl border border-white/10 p-4 transition-all hover:border-[#10B981]/50 hover:bg-white/5 group"
                      style={{ background: 'rgba(17, 24, 39, 0.6)' }}
                    >
                      <div className="flex items-start justify-between">
                        <h3 className="text-lg font-semibold text-white group-hover:text-[#10B981] transition-colors">
                          {template.name}
                        </h3>
                        <svg
                          className="text-gray-500 group-hover:text-[#10B981] transition-colors mt-1"
                          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        >
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </div>
                      <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                        {template.description}
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                          </svg>
                          {template.nodeCount} nodes
                        </span>
                        <span className="flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                          </svg>
                          {template.connectionCount} connections
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Workflows Section */}
            <section>
              <h2 className="text-2xl font-semibold text-white mb-6">Your Workflows</h2>

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
                  <h3 className="text-xl font-semibold text-white mb-2">No workflows yet</h3>
                  <p className="text-gray-400 mb-6 max-w-md mx-auto">
                    Create your first workflow or start from a template above
                  </p>
                  <button
                    onClick={createNewWorkflow}
                    className="px-6 py-3 rounded-lg text-white font-semibold transition-opacity hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                  >
                    Create Your First Workflow
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
                            {workflow.nodes?.length || 0} nodes
                          </span>
                          <span className="flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                            </svg>
                            {workflow.connections?.length || 0} connections
                          </span>
                        </div>
                      </Link>
                      <div className="px-4 py-2 border-t border-white/10 flex justify-between items-center">
                        <span className="text-xs text-gray-600">
                          {new Date(workflow.updatedAt).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => deleteWorkflow(workflow.id)}
                          className="text-xs text-red-400/70 hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
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
