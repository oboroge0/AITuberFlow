'use client';

import React, { useEffect, useRef } from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';

export default function LogPanel() {
  const { logs, clearLogs, isExecuting } = useWorkflowStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogStyle = (level: string) => {
    switch (level) {
      case 'error':
        return { color: '#EF4444' };
      case 'warning':
        return { color: '#F59E0B' };
      case 'success':
        return { color: '#10B981' };
      case 'debug':
        return { color: '#6B7280' };
      default:
        return { color: '#3B82F6' };
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ja-JP', { hour12: false });
  };

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.1)',
        height: '150px',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 border-b border-white/10 flex items-center justify-between"
        style={{ flexShrink: 0 }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: '#10B981' }}>
            ▸ Execution Log
          </span>
          {isExecuting && (
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          )}
        </div>
        <button
          onClick={clearLogs}
          className="text-[10px] text-gray-500 hover:text-white transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2"
        style={{ fontFamily: 'monospace', fontSize: '11px' }}
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-4">
            Ready to run
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="mb-1"
              style={getLogStyle(log.level)}
            >
              <span style={{ opacity: 0.5 }}>[{formatTime(log.timestamp)}]</span>{' '}
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
