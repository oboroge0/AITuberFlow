'use client';

import React, { useMemo, useState } from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';
import { usePluginStore } from '@/stores/pluginStore';
import { toast } from '@/stores/toastStore';
import { useTranslation } from '@/stores/localeStore';
import type { ActivityCycle, CycleStep } from '@/lib/types';

// Status colors follow the node border color language:
// green = completed, red = error, blue = running
const STATUS_COLOR: Record<ActivityCycle['status'], string> = {
  completed: '#10B981',
  error: '#EF4444',
  running: '#3B82F6',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour12: false });
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '';
  return `${(ms / 1000).toFixed(1)}s`;
}

// Trigger display convention (icon-less): quoted text = utterance-like input,
// plain labels = system triggers
function triggerLabel(cycle: ActivityCycle, t: (key: string) => string): string {
  const trigger = cycle.trigger;
  if (!trigger) return t('activity.triggerRun');
  if (trigger.eventType === 'manual') return t('activity.triggerManual');
  if (trigger.summary && trigger.summary !== trigger.eventType) return `「${trigger.summary}」`;
  return trigger.eventType;
}

export default function ActivityDrawer() {
  const { t } = useTranslation();
  const { cycles, logs, nodes, selectNode, clearCycles, clearLogs, isExecuting } = useWorkflowStore();
  const { getPluginLabel } = usePluginStore();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'activity' | 'raw'>('activity');
  const [expandedCycles, setExpandedCycles] = useState<Record<string, boolean>>({});

  const errorCount = useMemo(() => cycles.filter((c) => c.status === 'error').length, [cycles]);

  const nodeLabel = (nodeId: string): string => {
    const node = nodes.find((n) => n.id === nodeId);
    return node ? getPluginLabel(node.type) : nodeId;
  };

  // Newest first so the latest cycle is visible without scrolling
  const ordered = useMemo(() => [...cycles].reverse(), [cycles]);

  const responsePreview = (cycle: ActivityCycle): string => {
    if (cycle.status === 'error') {
      const failed = cycle.steps.find((s) => s.status === 'error');
      if (failed) return `${nodeLabel(failed.nodeId)}: ${failed.error ?? t('status.error')}`;
    }
    for (let i = cycle.steps.length - 1; i >= 0; i--) {
      const p = cycle.steps[i].textPreview;
      if (p) return `「${p}」`;
    }
    return '';
  };

  const copyError = async (step: CycleStep) => {
    try {
      await navigator.clipboard.writeText(`${nodeLabel(step.nodeId)}: ${step.error ?? ''}`);
      toast.success(t('activity.copiedError'));
    } catch {
      toast.error(t('activity.copyFailed'));
    }
  };

  return (
    <div
      className="absolute z-20 flex flex-col"
      style={{ left: '325px', right: '20px', bottom: '20px' }}
    >
      {/* Body (above the toggle bar, opens upward) */}
      {open && (
        <div
          className="flex flex-col overflow-hidden"
          style={{
            background: 'var(--surface-strong)',
            border: '1px solid var(--border)',
            borderBottom: 'none',
            borderRadius: '12px 12px 0 0',
            height: '38vh',
            minHeight: '180px',
          }}
        >
          {/* Tabs */}
          <div className="flex border-b border-token-border flex-shrink-0">
            {([['activity', t('activity.title')], ['raw', t('activity.rawLog')]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-1.5 text-xs transition-colors ${
                  tab === key
                    ? 'text-fgborder-b-2 border-emerald-400 bg-elevated'
                    : 'text-fg-faint hover:text-fg-muted'
                }`}
              >
                {label}
              </button>
            ))}
            <div className="ml-auto flex items-center pr-2">
              <button
                onClick={() => (tab === 'activity' ? clearCycles() : clearLogs())}
                className="text-[10px] text-fg-faint hover:text-fg px-2 py-1 transition-colors"
              >
                {t('activity.clear')}
              </button>
            </div>
          </div>

          {/* Activity tab */}
          {tab === 'activity' && (
            <div className="flex-1 overflow-y-auto">
              {ordered.length === 0 ? (
                <div className="text-fg-faint text-xs text-center py-6">
                  {t('activity.emptyHistory')}
                </div>
              ) : (
                ordered.map((cycle) => {
                  const isExpanded = !!expandedCycles[cycle.id];
                  const color = STATUS_COLOR[cycle.status];
                  return (
                    <div key={cycle.id} className="border-b border-token-border-subtle">
                      {/* Summary row */}
                      <button
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 hover:bg-hover transition-colors"
                        style={{ borderLeft: `3px solid ${color}` }}
                        onClick={() =>
                          setExpandedCycles((prev) => ({ ...prev, [cycle.id]: !prev[cycle.id] }))
                        }
                        aria-expanded={isExpanded}
                      >
                        <span className="text-[10px] text-fg-faint select-none flex-shrink-0 w-3">
                          {isExpanded ? '▽' : '▷'}
                        </span>
                        <span className="text-[10px] text-fg-faint flex-shrink-0 font-mono">
                          {formatTime(cycle.startedAt)}
                        </span>
                        <span
                          className="text-[11px] truncate flex-shrink-0 max-w-[30%]"
                          style={{ color: cycle.status === 'error' ? '#FCA5A5' : 'var(--text-strong)' }}
                        >
                          {triggerLabel(cycle, t)}
                        </span>
                        <span
                          className="text-[11px] truncate flex-1"
                          style={{ color: cycle.status === 'error' ? '#FCA5A5' : 'var(--text-muted)' }}
                        >
                          {responsePreview(cycle)}
                        </span>
                        <span className="text-[10px] text-fg-faint flex-shrink-0 font-mono">
                          {cycle.status === 'running' ? t('activity.running') : formatDuration(cycle.totalDuration)}
                        </span>
                      </button>

                      {/* Steps (expanded) */}
                      {isExpanded && (
                        <div className="pb-1" style={{ borderLeft: `3px solid ${color}` }}>
                          {cycle.steps.map((step, i) => (
                            <div
                              key={`${step.nodeId}-${i}`}
                              className="flex items-start gap-2 pl-7 pr-3 py-1 hover:bg-hover cursor-pointer"
                              onClick={() => selectNode(step.nodeId)}
                              title={t('activity.clickToSelect')}
                            >
                              <span
                                className="text-[10px] flex-shrink-0 w-[110px] truncate"
                                style={{ color: STATUS_COLOR[step.status] }}
                              >
                                {nodeLabel(step.nodeId)}
                              </span>
                              <span className="text-[10px] text-fg-faint flex-shrink-0 w-10 font-mono text-right">
                                {step.status === 'running' ? '…' : formatDuration(step.duration)}
                              </span>
                              {step.status === 'error' ? (
                                <span className="text-[10px] text-red-600 dark:text-red-300 break-words flex-1">
                                  {step.error}
                                  <button
                                    className="ml-2 text-fg-faint hover:text-fg underline"
                                    onClick={(e) => { e.stopPropagation(); void copyError(step); }}
                                  >
                                    {t('common.copy')}
                                  </button>
                                </span>
                              ) : (
                                <span className="text-[10px] text-fg-muted truncate flex-1">
                                  {step.textPreview ? `「${step.textPreview}」` : step.resultSummary ?? ''}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Raw log tab */}
          {tab === 'raw' && (
            <div className="flex-1 overflow-y-auto px-3 py-2" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
              {logs.length === 0 ? (
                <div className="text-fg-faint text-center py-6">{t('activity.emptyLog')}</div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="mb-0.5 break-words"
                    style={{
                      color:
                        log.level === 'error' ? '#EF4444'
                        : log.level === 'warning' ? '#F59E0B'
                        : log.level === 'success' ? '#10B981'
                        : log.level === 'debug' ? '#6B7280'
                        : 'var(--text-muted)',
                    }}
                  >
                    <span style={{ opacity: 0.5 }}>[{formatTime(log.timestamp)}]</span> {log.message}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Toggle bar */}
      <button
        className="flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-hover"
        style={{
          background: 'var(--surface-strong)',
          border: '1px solid var(--border)',
          borderRadius: open ? '0 0 12px 12px' : '12px',
          color: 'var(--text-muted)',
        }}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="select-none text-fg-faint">{open ? '▽' : '△'}</span>
        <span>{t('activity.title')}</span>
        {isExecuting && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
        {cycles.length > 0 && (
          <span className="text-fg-faint">{cycles.length}{t('activity.items')}</span>
        )}
        {errorCount > 0 && (
          <span className="text-red-400 font-medium">{t('status.error')} {errorCount}</span>
        )}
      </button>
    </div>
  );
}
