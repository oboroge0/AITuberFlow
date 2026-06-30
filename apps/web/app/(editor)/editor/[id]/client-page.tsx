'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import Canvas from '@/components/editor/Canvas';
import Sidebar from '@/components/editor/Sidebar';
import NodeSettings from '@/components/panels/NodeSettings';
import ActivityDrawer from '@/components/panels/ActivityDrawer';
import ExpressionPresets from '@/components/panels/ExpressionPresets';
import MotionLibrary, { Motion } from '@/components/panels/MotionLibrary';
import { AvatarView, RendererType } from '@/components/avatar';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { toast } from '@/stores/toastStore';
import { useTranslation } from '@/stores/localeStore';
import api from '@/lib/api';
import { DEFAULT_MODEL_URL } from '@/lib/constants';
import { resolveWorkflowId } from '@/lib/routeParams';
import { getApiBaseUrl } from '@/lib/runtimeEndpoints';

const API_BASE = getApiBaseUrl();

// Auto-save error throttling state (module-level to persist across re-renders)
let lastAutoSaveError: string | null = null;
let lastAutoSaveErrorAt: number = 0;
const AUTO_SAVE_ERROR_THROTTLE_MS = 30000; // 30 seconds

// Session storage key for import success message
const IMPORT_SUCCESS_KEY = 'aituber-flow-import-success';

// Zoom Controls component using ReactFlow's zoom API
function ZoomControls() {
  const { t } = useTranslation();
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="flex flex-col gap-0.5 bg-surface-strong rounded-lg border border-token-border shadow-lg overflow-hidden">
      <button
        onClick={() => zoomIn()}
        className="w-7 h-7 flex items-center justify-center text-fg hover:bg-hover transition-colors"
        title={t('editor.zoomIn')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <div className="h-px bg-elevated" />
      <button
        onClick={() => zoomOut()}
        className="w-7 h-7 flex items-center justify-center text-fg hover:bg-hover transition-colors"
        title={t('editor.zoomOut')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <div className="h-px bg-elevated" />
      <button
        onClick={() => fitView()}
        className="w-7 h-7 flex items-center justify-center text-fg hover:bg-hover transition-colors"
        title={t('editor.fitView')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </button>
    </div>
  );
}

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

type TauriInternals = {
  invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

export default function EditorPage() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const workflowId = useMemo(() => resolveWorkflowId(params.id, 'editor'), [params.id]);

  const [editorLoading, setEditorLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [previewKey] = useState(() => Date.now());
  const [editedName, setEditedName] = useState('');
  const [showAvatarControls, setShowAvatarControls] = useState(false);
  const [avatarControlTab, setAvatarControlTab] = useState<'expression' | 'motion'>('expression');
  const { t } = useTranslation();
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
    selectNode,
    settingsPanelOpen,
    setSettingsPanelOpen,
    removeNode,
    nodes,
    connections,
    character,
    setNodeStatus,
    nodeStatuses,
  } = useWorkflowStore();

  // Close the settings panel when node selection is cleared
  useEffect(() => {
    if (!selectedNodeId && settingsPanelOpen) {
      setSettingsPanelOpen(false);
    }
  }, [selectedNodeId, settingsPanelOpen, setSettingsPanelOpen]);

  // Count nodes with error status
  const errorCount = useMemo(() => {
    return Object.values(nodeStatuses).filter(
      (s) => s?.status === 'error'
    ).length;
  }, [nodeStatuses]);

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
  const { avatarState, clearMotion, emit, updateAvatarState, connectionStatus, reconnectAttempt } = useWebSocket(workflowId);

  // Handle motion selection from library
  const handleMotionSelect = useCallback((motion: Motion) => {
    updateAvatarState({ motion: motion.url });
    emit('avatar.motion', { motionUrl: motion.url });
  }, [emit, updateAvatarState]);

  // Handle expression change from presets
  const handleExpressionChange = useCallback((expression: string) => {
    updateAvatarState({ expression });
    emit('avatar.expression', { expression });
  }, [emit, updateAvatarState]);

  // Handle mouth change from presets
  const handleMouthChange = useCallback((value: number) => {
    updateAvatarState({ mouthOpen: value });
    emit('avatar.mouth', { value });
  }, [emit, updateAvatarState]);

  // Extract avatar config from workflow nodes
  const avatarConfig = useMemo(() => {
    const avatarNode = nodes.find((n) =>
      n.type === 'avatar-configuration' || n.type === 'avatar-controller'
    );

    return {
      hasAvatarNode: !!avatarNode,
      renderer: (avatarNode?.config?.renderer || 'vrm') as RendererType,
      modelUrl: avatarNode?.config?.modelUrl || avatarNode?.config?.model_url || DEFAULT_MODEL_URL,
      animationUrl: avatarNode?.config?.idleAnimation || avatarNode?.config?.idle_animation,
    };
  }, [nodes]);

  // Show preview only when avatar node exists and renderer is VRM
  const showPreview = avatarConfig.hasAvatarNode && avatarConfig.renderer === 'vrm';

  const openOverlay = useCallback(async () => {
    if (!workflowId || workflowId === '_') return;
    const overlayPath = `/overlay/${workflowId}`;
    const tauri = (window as Window & { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;

    if (typeof tauri?.invoke === 'function') {
      try {
        await tauri.invoke('open_overlay_window', { workflowId });
        return;
      } catch (error) {
        console.error('Failed to open overlay window via Tauri command:', error);
      }
    }

    window.open(overlayPath, '_blank');
  }, [workflowId]);

  const copyOverlayUrl = useCallback(async () => {
    if (!workflowId || workflowId === '_') return;
    const url = `${window.location.origin}/overlay/${workflowId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('editor.copiedOverlayUrl'));
    } catch (error) {
      console.error('Failed to copy overlay url:', error);
      toast.error(t('editor.copyUrlFailed'));
    }
  }, [workflowId]);

  // Load workflow on mount
  useEffect(() => {
    if (workflowId && workflowId !== 'new' && workflowId !== '_') {
      loadWorkflowData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  const loadWorkflowData = async () => {
    isInitialLoad.current = true;
    const [response, statusResponse] = await Promise.all([
      api.getWorkflow(workflowId),
      api.getWorkflowStatus(workflowId),
    ]);
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

      if (statusResponse.data) {
        setExecuting(statusResponse.data.status === 'running');
      } else if (statusResponse.error) {
        console.warn(`Could not sync execution state: ${statusResponse.error}`);
      }

      // Check for import success message from sessionStorage
      const importSuccessName = sessionStorage.getItem(IMPORT_SUCCESS_KEY);
      if (importSuccessName) {
        sessionStorage.removeItem(IMPORT_SUCCESS_KEY);
        toast.success(t('editor.importComplete') + importSuccessName);
      }

      // Allow auto-save after initial load settles
      setTimeout(() => {
        isInitialLoad.current = false;
        setEditorLoading(false);
      }, 500);
    } else if (response.error) {
      setEditorLoading(false);
      toast.error(t('editor.loadWorkflowFailed') + response.error);
      if (workflowId !== '_' && response.error.includes('not found')) {
        router.push('/');
      }
    }
  };

  // Track saving state with ref to avoid circular dependencies
  const savingRef = useRef(false);

  // Auto-save when workflow changes (debounced)
  const performAutoSave = useCallback(async () => {
    if (savingRef.current || workflowId === 'new' || workflowId === '_') return;

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
      // Throttle auto-save error toasts to avoid spam
      const now = Date.now();
      const isDifferentError = response.error !== lastAutoSaveError;
      const isThrottleExpired = now - lastAutoSaveErrorAt > AUTO_SAVE_ERROR_THROTTLE_MS;

      if (isDifferentError || isThrottleExpired) {
        toast.error(t('editor.autoSaveFailed') + response.error);
        lastAutoSaveError = response.error;
        lastAutoSaveErrorAt = now;
      }
    } else {
      // Show "Saved" indicator briefly
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
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

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSave: () => {
      if (workflowId !== 'new') {
        handleSave();
      }
    },
    onDelete: () => {
      if (selectedNodeId) {
        removeNode(selectedNodeId);
        // Toast is shown by Canvas.tsx onNodesChange handler
      }
    },
    onEscape: () => {
      selectNode(null);
      setShowAvatarControls(false);
    },
  });

  const handleStart = async (startNodeId?: string) => {
    clearLogs();

    // Get current workflow data from store (not saved version)
    const currentData = getWorkflowData();

    // Run validation before starting
    const validationResponse = await api.validateWorkflow(workflowId, {
      nodes: currentData.nodes,
      connections: currentData.connections,
    });

    if (validationResponse.error) {
      toast.warning(t('editor.validationSkipped') + validationResponse.error);
      addLog({
        level: 'warning',
        message: `バリデーションAPI呼び出しに失敗しました: ${validationResponse.error}`,
      });
    }

    if (validationResponse.data) {
      const { errors, warnings } = validationResponse.data;

      // Clear previous validation highlights
      for (const node of currentData.nodes) {
        setNodeStatus(node.id, 'idle', {});
      }

      // Show warnings as toasts
      for (const warning of warnings) {
        toast.warning(`${warning.nodeName}: ${warning.message}`);
        addLog({
          level: 'warning',
          message: `[${warning.nodeName}] ${warning.message}`,
          nodeId: warning.nodeId,
        });
      }

      // Highlight nodes with issues
      for (const issue of [...errors, ...warnings]) {
        setNodeStatus(issue.nodeId, issue.level === 'error' ? 'error' : 'warning', {
          validationIssue: issue.message,
        });
      }

      // If there are errors, block execution
      if (errors.length > 0) {
        for (const error of errors) {
          toast.error(`${error.nodeName}: ${error.message}`);
          addLog({
            level: 'error',
            message: `[${error.nodeName}] ${error.message}`,
            nodeId: error.nodeId,
          });
        }
        addLog({
          level: 'error',
          message: `バリデーションエラー: ${errors.length}件のエラーが見つかりました。修正してから再実行してください。`,
        });
        return;
      }
    }

    if (startNodeId) {
      addLog({ level: 'info', message: `▶ Starting from node: ${startNodeId}` });
    } else {
      addLog({ level: 'info', message: '▶ Starting workflow...' });
    }

    const response = await api.startWorkflow(workflowId, {
      nodes: currentData.nodes,
      connections: currentData.connections,
      character: currentData.character,
      startNodeId,
    });

    if (response.error) {
      addLog({ level: 'error', message: `Failed to start: ${response.error}` });
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

  // Export workflow as JSON file
  const handleExport = async () => {
    // Use API endpoint which strips API keys by default for security
    const response = await api.exportWorkflow(workflowId, { excludeApiKeys: true });

    if (response.error) {
      addLog({ level: 'error', message: `Export failed: ${response.error}` });
      return;
    }

    const exportData = {
      version: response.data?.version || '1.0',
      exportedAt: response.data?.exportedAt || new Date().toISOString(),
      workflow: {
        name: response.data?.name,
        description: response.data?.description,
        nodes: response.data?.nodes,
        connections: response.data?.connections,
        character: response.data?.character,
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportData.workflow.name || 'workflow'}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addLog({ level: 'success', message: 'Workflow exported (API keys excluded for security)' });
  };

  // Import workflow from JSON file - creates a new workflow
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importData = JSON.parse(text);

        // Extract workflow data - handle both wrapped and flat formats
        // Wrapped: { version, workflow: { name, nodes, ... } }
        // Flat: { name, nodes, ... }
        const workflow = importData.workflow || importData;

        // Validate import data structure
        if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
          throw new Error('Invalid workflow file: missing or invalid nodes array');
        }

        if (workflow.nodes.length === 0) {
          addLog({ level: 'warning', message: 'Warning: Importing workflow with no nodes' });
        }

        // Prepare import data
        const importPayload = {
          name: workflow.name ? `${workflow.name} (Imported)` : 'Imported Workflow',
          description: workflow.description || '',
          nodes: workflow.nodes,
          connections: workflow.connections || [],
          character: workflow.character || { name: 'AI Assistant', personality: 'Friendly and helpful' },
        };

        // Create a new workflow via API
        const response = await api.importWorkflow(importPayload);

        if (response.error) {
          throw new Error(response.error);
        }

        if (!response.data?.id) {
          throw new Error('Import succeeded but no workflow ID returned');
        }

        addLog({ level: 'success', message: `Imported as new workflow: ${response.data.name}` });

        // Persist success message to sessionStorage for the target page to display
        // (toast would be lost due to immediate page navigation)
        sessionStorage.setItem(IMPORT_SUCCESS_KEY, response.data.name);

        // Navigate to the new workflow
        // Use window.location.href to force a full page reload
        window.location.href = `/editor/${response.data.id}`;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        toast.error(t('editor.importFailed') + errorMessage);
        addLog({ level: 'error', message: `Import failed: ${errorMessage}` });
      }
    };
    input.click();
  };

  return (
    <div
      className="h-screen w-screen relative overflow-hidden"
      style={{
        background: 'var(--bg-gradient)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Loading overlay */}
      {editorLoading && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center" style={{ background: 'var(--bg-gradient)' }}>
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-token-border border-t-emerald-400 animate-spin" />
            <span className="text-sm text-fg-muted">読み込み中...</span>
          </div>
        </div>
      )}

      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(var(--grid-line) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Header */}
      <div className="absolute top-5 left-5 z-10 flex items-center gap-4">
        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          className="w-10 h-10 rounded-[10px] flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-all"
          title={t('editor.backToWorkflows')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>

        {/* Logo */}
        <div
          className="w-10 h-10 rounded-[10px] overflow-hidden flex items-center justify-center"
          style={{
            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="AITuberFlow logo"
            className="w-full h-full object-cover"
          />
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
              className="text-xl font-bold text-fg bg-elevated border border-token-border rounded px-2 py-0.5 outline-none focus:border-emerald-500 w-[200px]"
            />
          ) : (
            <h1
              className="text-xl font-bold text-fg m-0 cursor-pointer hover:text-emerald-400 transition-colors"
              onClick={handleStartEditingName}
              title={t('editor.clickToEditName')}
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
          <div className="flex items-center gap-2">
            <p className="text-xs text-fg-dim m-0">
              Build your AI streamer visually
            </p>
            {/* Connection status indicator */}
            {connectionStatus === 'reconnecting' && (
              <span className="text-xs flex items-center gap-1 text-yellow-400" title={`Reconnecting (${reconnectAttempt}/10)...`}>
                <svg
                  className="animate-spin"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                {t('editor.reconnecting')}
              </span>
            )}
            {connectionStatus === 'disconnected' && (
              <span className="text-xs flex items-center gap-1 text-red-400" title="Disconnected from server">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {t('editor.offline')}
              </span>
            )}
            {/* Auto-save indicator */}
            {saving ? (
              <span className="text-xs flex items-center gap-1 text-emerald-400">
                <svg
                  className="animate-spin"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                {t('editor.saving')}
              </span>
            ) : showSaved ? (
              <span className="text-xs flex items-center gap-1 text-emerald-400">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t('editor.saved')}
              </span>
            ) : null}
          </div>
        </div>

        {/* Error count badge - shown only when there are errors */}
        {errorCount > 0 && (
          <div
            className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-700 dark:text-red-300 flex items-center gap-2 text-sm cursor-default"
            title={`${errorCount} node(s) with errors`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-medium">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Avatar Controls toggle - only show when preview is available */}
        {showPreview && (
        <button
          onClick={() => setShowAvatarControls(!showAvatarControls)}
          className={`px-4 py-2 rounded-lg border transition-all flex items-center gap-2 text-sm ${
            showAvatarControls
              ? 'bg-pink-500/30 border-pink-500/50 text-pink-700 dark:text-pink-300'
              : 'bg-pink-500/20 border-pink-500/50 text-pink-700 dark:text-pink-300 hover:bg-pink-500/30'
          }`}
          title={t('editor.toggleAvatarControls')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
          {t('editor.controls')}
        </button>
        )}

        {/* Open Overlay button */}
        <button
          onClick={() => {
            void openOverlay();
          }}
          className="px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/50 text-purple-700 dark:text-purple-300 hover:bg-purple-500/30 transition-all flex items-center gap-2 text-sm"
          title={t('editor.openOverlay')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          {t('editor.overlay')}
        </button>

        <button
          onClick={() => {
            void copyOverlayUrl();
          }}
          className="px-4 py-2 rounded-lg bg-indigo-500/20 border border-indigo-500/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/30 transition-all flex items-center gap-2 text-sm"
          title={t('editor.copyOverlayUrl')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          {t('editor.copyUrl')}
        </button>
      </div>

      {/* Preview Panel - Avatar Only (shown only when avatar node exists and VRM is selected) */}
      {showPreview && (
      <div
        className="absolute top-20 right-5 z-20 w-[280px] overflow-hidden flex flex-col"
        style={{
          background: 'var(--surface-strong)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          height: settingsPanelOpen && selectedNodeId ? '280px' : 'calc(100% - 100px)',
          minHeight: '280px',
          transition: 'height 0.2s ease',
        }}
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-token-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            {t('editor.preview')}
          </div>
          <div className="text-xs text-fg-faint">
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
        <div className="px-3 py-1.5 border-t border-token-border text-xs text-fg-faint flex justify-between relative z-10 bg-surface-strong">
          <span>{avatarConfig.renderer.toUpperCase()}</span>
          <span>Mouth: {(avatarState.mouthOpen * 100).toFixed(0)}%</span>
        </div>
      </div>
      )}

      {/* Avatar Controls Panel - Left side, toggleable */}
      {showPreview && showAvatarControls && (
        <div
          className="absolute z-20 overflow-hidden flex flex-col"
          style={{
            top: '80px',
            left: '285px',
            width: '260px',
            height: 'calc(100% - 180px)',
            background: 'var(--surface-strong)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
          }}
        >
          {/* Tab Headers */}
          <div className="flex border-b border-token-border">
            <button
              onClick={() => setAvatarControlTab('expression')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                avatarControlTab === 'expression'
                  ? 'text-pink-400 border-b-2 border-pink-400 bg-pink-400/5'
                  : 'text-fg-dim hover:text-fg-muted hover:bg-hover'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                  <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
                {t('editor.expression')}
              </div>
            </button>
            <button
              onClick={() => setAvatarControlTab('motion')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                avatarControlTab === 'motion'
                  ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-400/5'
                  : 'text-fg-dim hover:text-fg-muted hover:bg-hover'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                {t('editor.motion')}
              </div>
            </button>
            {/* Close button */}
            <button
              onClick={() => setShowAvatarControls(false)}
              className="px-2 py-2 text-fg-faint hover:text-fg-muted hover:bg-hover transition-colors"
              title={t('editor.close')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {avatarControlTab === 'expression' && (
              <div className="flex-1 overflow-y-auto">
                <ExpressionPresets
                  currentExpression={avatarState.expression}
                  currentMouthOpen={avatarState.mouthOpen}
                  onExpressionChange={handleExpressionChange}
                  onMouthChange={handleMouthChange}
                />
              </div>
            )}

            {avatarControlTab === 'motion' && (
              <div className="flex-1 min-h-0 overflow-hidden">
                <MotionLibrary
                  onSelect={handleMotionSelect}
                  selectedUrl={avatarState.motion}
                />
              </div>
            )}
          </div>
        </div>
      )}

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
            onExport={handleExport}
            onImport={handleImport}
          />
        </div>

        {/* Zoom Controls */}
        <div
          className="absolute z-10"
          style={{ left: '285px', bottom: '25px' }}
        >
          <ZoomControls />
        </div>

        {/* Activity drawer (execution cycles + raw log) */}
        <ActivityDrawer />

        {/* Node settings panel — opened on demand from a node's gear button or
            from complex/dynamic field rows that cannot be edited inline */}
        {settingsPanelOpen && selectedNodeId && (
          <div
            className="absolute right-5 bottom-5 z-30 w-[280px] overflow-hidden flex flex-col"
            style={{
              top: showPreview ? '360px' : '80px',
              background: 'var(--surface-strong)',
              borderRadius: '16px',
              border: '1px solid var(--border)',
            }}
          >
            <div className="px-3 py-2 border-b border-token-border flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2 text-sm text-fg-muted">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                {t('editor.nodeDetailSettings')}
              </div>
              <button
                onClick={() => setSettingsPanelOpen(false)}
                className="text-fg-faint hover:text-fg-muted transition-colors p-0.5"
                title={t('editor.close')}
                aria-label={t('editor.closeSettingsPanel')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <NodeSettings />
            </div>
          </div>
        )}
      </ReactFlowProvider>
    </div>
  );
}
