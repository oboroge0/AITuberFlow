'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ReactFlowProvider } from '@xyflow/react';
import Canvas from '@/components/editor/Canvas';
import Sidebar from '@/components/editor/Sidebar';
import NodeSettings from '@/components/panels/NodeSettings';
import LogPanel from '@/components/panels/LogPanel';
import { AvatarView, RendererType } from '@/components/avatar';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import api from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

// Helper to get full URL for backend-served files
const getFullUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  // Already absolute URL or local public path
  if (url.startsWith('http') || url.startsWith('/models/') || url.startsWith('/animations/')) {
    return url;
  }
  // API path - prepend backend URL
  if (url.startsWith('/api/')) {
    return `${API_BASE}${url}`;
  }
  return url;
};

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;

  const [saving, setSaving] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [previewKey] = useState(() => Date.now());
  const [editedName, setEditedName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isInitialLoad = useRef(true);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    loadWorkflow,
    getWorkflowData,
    workflowName,
    setWorkflowName,
    isExecuting,
    setExecuting,
    addLog,
    clearLogs,
    selectedNodeId,
    nodes,
    connections,
    character,
  } = useWorkflowStore();

  // Handle name editing
  const handleStartEditingName = () => {
    setEditedName(workflowName);
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const handleFinishEditingName = () => {
    if (editedName.trim()) {
      setWorkflowName(editedName.trim());
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishEditingName();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
    }
  };

  // Connect WebSocket and get avatar state
  const { avatarState, clearMotion } = useWebSocket(workflowId);

  // Extract avatar config from workflow nodes
  const avatarConfig = useMemo(() => {
    const avatarNode = nodes.find((n) =>
      n.type === 'avatar-configuration' || n.type === 'avatar-controller'
    );

    return {
      renderer: (avatarNode?.config?.renderer || 'vrm') as RendererType,
      modelUrl: avatarNode?.config?.model_url || '/models/a1185aea_Flowchan.vrm',
      animationUrl: avatarNode?.config?.idle_animation,
    };
  }, [nodes]);

  // Load workflow on mount
  useEffect(() => {
    if (workflowId && workflowId !== 'new') {
      loadWorkflowData();
    }
  }, [workflowId]);

  const loadWorkflowData = async () => {
    isInitialLoad.current = true;
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
      // Allow auto-save after initial load settles
      setTimeout(() => {
        isInitialLoad.current = false;
      }, 500);
    } else if (response.error) {
      console.error('Failed to load workflow:', response.error);
      if (response.error.includes('not found')) {
        router.push('/');
      }
    }
  };

  // Track saving state with ref to avoid circular dependencies
  const savingRef = useRef(false);

  // Auto-save when workflow changes (debounced)
  const performAutoSave = useCallback(async () => {
    if (savingRef.current || workflowId === 'new') return;

    savingRef.current = true;
    setSaving(true);
    const data = getWorkflowData();

    const response = await api.updateWorkflow(workflowId, {
      name: data.name,
      nodes: data.nodes,
      connections: data.connections,
      character: data.character,
    });

    if (response.error) {
      console.error('Auto-save failed:', response.error);
    }

    savingRef.current = false;
    setSaving(false);
  }, [workflowId, getWorkflowData]);

  // Watch for changes and trigger auto-save
  useEffect(() => {
    // Skip auto-save during initial load
    if (isInitialLoad.current) return;

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new timeout for auto-save (2 seconds after last change)
    autoSaveTimeoutRef.current = setTimeout(() => {
      performAutoSave();
    }, 2000);

    // Cleanup on unmount
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, connections, workflowName, character]);

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

  const handleStart = async (startNodeId?: string) => {
    clearLogs();
    if (startNodeId) {
      addLog({ level: 'info', message: `▶ Starting from node: ${startNodeId}` });
    } else {
      addLog({ level: 'info', message: '▶ Starting workflow...' });
    }

    // Get current workflow data from store (not saved version)
    const currentData = getWorkflowData();

    const response = await api.startWorkflow(workflowId, {
      nodes: currentData.nodes,
      connections: currentData.connections,
      character: currentData.character,
      startNodeId,
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

      {/* Header */}
      <div className="absolute top-5 left-5 z-10 flex items-center gap-4">
        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
          title="Back to Workflows"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>

        {/* Logo */}
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

        {/* Title */}
        <div>
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleFinishEditingName}
              onKeyDown={handleNameKeyDown}
              className="text-xl font-bold text-white bg-white/10 border border-white/20 rounded px-2 py-0.5 outline-none focus:border-emerald-500 w-[200px]"
            />
          ) : (
            <h1
              className="text-xl font-bold text-white m-0 cursor-pointer hover:text-emerald-400 transition-colors"
              onClick={handleStartEditingName}
              title="Click to edit name"
            >
              {workflowName || 'AITuber Flow'}
              <svg
                className="inline-block ml-2 opacity-50"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </h1>
          )}
          <p className="text-xs text-white/50 m-0">
            Build your AI streamer visually
          </p>
        </div>

        {/* Open Overlay button */}
        <button
          onClick={() => window.open(`/overlay/${workflowId}`, '_blank')}
          className="px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/50 text-purple-300 hover:bg-purple-500/30 transition-all flex items-center gap-2 text-sm"
          title="Open OBS Overlay (new tab)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          Overlay
        </button>
      </div>

      {/* Preview Panel - OUTSIDE ReactFlowProvider to avoid event conflicts */}
      <div
        className="absolute top-20 right-5 z-20 w-[280px] overflow-hidden flex flex-col"
        style={{
          background: 'rgba(17, 24, 39, 0.95)',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)',
          height: selectedNodeId ? '280px' : 'calc(100% - 100px)',
          minHeight: '280px',
          transition: 'height 0.2s ease',
        }}
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-white/70">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            Preview
          </div>
          <div className="text-xs text-white/40">
            {avatarState.expression}
          </div>
        </div>
        {/* Avatar */}
        <div className="flex-1 relative min-h-0">
          <AvatarView
            key={previewKey}
            renderer={avatarConfig.renderer}
            modelUrl={getFullUrl(avatarConfig.modelUrl)}
            animationUrl={getFullUrl(avatarConfig.animationUrl)}
            state={avatarState}
            showSubtitles={false}
            backgroundColor="transparent"
            enableControls={true}
            showGrid={false}
            onMotionComplete={clearMotion}
          />
        </div>
        {/* Status bar */}
        <div className="px-3 py-1.5 border-t border-white/10 text-xs text-white/40 flex justify-between">
          <span>{avatarConfig.renderer.toUpperCase()}</span>
          <span>Mouth: {(avatarState.mouthOpen * 100).toFixed(0)}%</span>
        </div>
      </div>

      <ReactFlowProvider>
        {/* Canvas - Full screen, panels overlay on top */}
        <div className="absolute inset-0">
          <Canvas onSave={handleSave} onRunWorkflow={handleStart} />
        </div>

        {/* Left Sidebar - Node Palette */}
        <div className="absolute top-20 left-5 bottom-5 z-10">
          <Sidebar
            isRunning={isExecuting}
            onToggleRun={handleToggleRun}
            onSave={handleSave}
          />
        </div>

        {/* Log Panel at bottom */}
        <div
          className="absolute bottom-5 z-10"
          style={{ left: '285px', right: '320px' }}
        >
          <LogPanel />
        </div>

        {/* Node Settings - Inside ReactFlowProvider, shown when a node is selected */}
        {selectedNodeId && (
          <div
            className="absolute right-5 bottom-5 z-10 w-[280px] flex-1 overflow-hidden flex flex-col"
            style={{
              top: '360px',
              background: 'rgba(17, 24, 39, 0.95)',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <NodeSettings />
          </div>
        )}
      </ReactFlowProvider>
    </div>
  );
}
