'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ReactFlowProvider } from '@xyflow/react';
import Canvas from '@/components/editor/Canvas';
import Sidebar from '@/components/editor/Sidebar';
import NodeSettings from '@/components/panels/NodeSettings';
import LogPanel from '@/components/panels/LogPanel';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import api from '@/lib/api';

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;

  const [saving, setSaving] = useState(false);

  const {
    loadWorkflow,
    getWorkflowData,
    workflowName,
    isExecuting,
    setExecuting,
    addLog,
    clearLogs,
    selectedNodeId,
  } = useWorkflowStore();

  // Connect WebSocket
  useWebSocket(workflowId);

  // Load workflow on mount
  useEffect(() => {
    if (workflowId && workflowId !== 'new') {
      loadWorkflowData();
    }
  }, [workflowId]);

  const loadWorkflowData = async () => {
    const response = await api.getWorkflow(workflowId);
    if (response.data) {
      loadWorkflow({
        id: response.data.id,
        name: response.data.name,
        nodes: response.data.nodes || [],
        connections: response.data.connections || [],
        character: response.data.character || {
          name: 'AI Assistant',
          personality: 'Friendly and helpful',
        },
      });
    } else if (response.error) {
      console.error('Failed to load workflow:', response.error);
      if (response.error.includes('not found')) {
        router.push('/');
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const data = getWorkflowData();

    const response = await api.updateWorkflow(workflowId, {
      name: data.name,
      nodes: data.nodes,
      connections: data.connections,
      character: data.character,
    });

    if (response.error) {
      addLog({ level: 'error', message: `Failed to save: ${response.error}` });
    } else {
      addLog({ level: 'success', message: 'Workflow saved' });
    }

    setSaving(false);
  };

  const handleStart = async () => {
    clearLogs();
    addLog({ level: 'info', message: '▶ Starting workflow...' });

    // Get current workflow data from store (not saved version)
    const currentData = getWorkflowData();

    const response = await api.startWorkflow(workflowId, {
      nodes: currentData.nodes,
      connections: currentData.connections,
      character: currentData.character,
    });

    if (response.error) {
      addLog({ level: 'error', message: `Failed to start: ${response.error}` });
    } else {
      setExecuting(true);
    }
  };

  const handleStop = async () => {
    const response = await api.stopWorkflow(workflowId);
    if (response.error) {
      addLog({ level: 'error', message: `Failed to stop: ${response.error}` });
    } else {
      setExecuting(false);
      addLog({ level: 'info', message: '⏹ Workflow stopped' });
    }
  };

  const handleToggleRun = () => {
    if (isExecuting) {
      handleStop();
    } else {
      handleStart();
    }
  };

  return (
    <ReactFlowProvider>
      <div
        className="h-screen w-screen relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {/* Grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Title in top-left */}
        <div className="absolute top-5 left-5 flex items-center gap-3 z-10">
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
            <h1 className="text-xl font-bold text-white m-0">
              {workflowName || 'AITuber Flow'}
            </h1>
            <p className="text-xs text-white/50 m-0">
              Build your AI streamer visually
            </p>
          </div>
        </div>

        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          className="absolute top-5 left-[180px] text-xs text-white/50 hover:text-white transition-colors z-10 bg-black/20 px-3 py-1.5 rounded-lg"
        >
          ← Workflows
        </button>

        {/* Canvas */}
        <div className="absolute inset-0 pr-[300px] pb-[170px]">
          <Canvas />
        </div>

        {/* Log Panel at bottom */}
        <div
          className="absolute bottom-5 left-5 z-10"
          style={{ right: '320px' }}
        >
          <LogPanel />
        </div>

        {/* Right Sidebar */}
        <div className="absolute top-5 right-5 bottom-5 z-10 flex flex-col gap-4">
          <Sidebar
            isRunning={isExecuting}
            onToggleRun={handleToggleRun}
            onSave={handleSave}
          />

          {/* Node Settings (shown when a node is selected) */}
          {selectedNodeId && (
            <div
              className="w-[280px] overflow-hidden flex flex-col"
              style={{
                background: 'rgba(17, 24, 39, 0.95)',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.1)',
                maxHeight: '300px',
              }}
            >
              <NodeSettings />
            </div>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
