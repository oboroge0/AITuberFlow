'use client';

import React, { useEffect, useState, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { AvatarView, AvatarState, RendererType } from '@/components/avatar';
import api, { ModelInfo } from '@/lib/api';
import { Workflow } from '@/lib/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8001';

interface AvatarConfig {
  renderer: RendererType;
  modelUrl?: string;
  vtubePort?: number;
  pngConfig?: {
    baseUrl: string;
    expressions: Record<string, string>;
    defaultExpression: string;
  };
}

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

export default function PreviewPage({ params }: PreviewPageProps) {
  const { id: workflowId } = use(params);
  const router = useRouter();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Avatar state
  const [avatarState, setAvatarState] = useState<AvatarState>({
    expression: 'neutral',
    mouthOpen: 0,
  });

  // Avatar config (from workflow settings or defaults)
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>({
    renderer: 'vrm',
    modelUrl: '/models/default.vrm',
  });

  // Subtitle state
  const [subtitle, setSubtitle] = useState('');
  const [showSubtitles, setShowSubtitles] = useState(true);

  // Background settings
  const [bgColor, setBgColor] = useState('transparent');
  const [showControls, setShowControls] = useState(false);

  // Model upload
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load workflow data
  useEffect(() => {
    const loadWorkflowData = async () => {
      try {
        const response = await api.getWorkflow(workflowId);
        if (response.data) {
          setWorkflow(response.data);

          // Extract avatar config from workflow if available
          const avatarNode = response.data.nodes.find((n) =>
            n.type === 'avatar-display' || n.type === 'avatar-render'
          );

          if (avatarNode?.config) {
            setAvatarConfig({
              renderer: avatarNode.config.renderer || 'vrm',
              modelUrl: avatarNode.config.model_url || avatarNode.config.vrm_model,
              vtubePort: avatarNode.config.vtube_port,
              pngConfig: avatarNode.config.png_config,
            });
          }
        }
      } catch (error) {
        console.error('Failed to load workflow:', error);
      }
    };

    loadWorkflowData();
  }, [workflowId]);

  // WebSocket connection
  useEffect(() => {
    const newSocket = io(WS_URL, {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket');
      setConnected(true);
      newSocket.emit('join', { workflow_id: workflowId });
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
      setConnected(false);
    });

    // Avatar events
    newSocket.on('avatar.expression', (data: { expression: string }) => {
      setAvatarState((prev) => ({ ...prev, expression: data.expression }));
    });

    newSocket.on('avatar.mouth', (data: { value: number }) => {
      setAvatarState((prev) => ({ ...prev, mouthOpen: data.value }));
    });

    newSocket.on('avatar.motion', (data: { motion: string }) => {
      setAvatarState((prev) => ({ ...prev, motion: data.motion }));
    });

    newSocket.on('avatar.lookAt', (data: { x: number; y: number }) => {
      setAvatarState((prev) => ({ ...prev, lookAt: data }));
    });

    // Combined avatar update
    newSocket.on('avatar.update', (data: Partial<AvatarState>) => {
      setAvatarState((prev) => ({ ...prev, ...data }));
    });

    // Subtitle events
    newSocket.on('subtitle', (data: { text: string }) => {
      setSubtitle(data.text);
    });

    // Execution events
    newSocket.on('execution.started', () => {
      setIsRunning(true);
    });

    newSocket.on('execution.stopped', () => {
      setIsRunning(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [workflowId]);

  // Control handlers
  const handleStart = useCallback(async () => {
    try {
      await api.startWorkflow(workflowId);
    } catch (error) {
      console.error('Failed to start workflow:', error);
    }
  }, [workflowId]);

  const handleStop = useCallback(async () => {
    try {
      await api.stopWorkflow(workflowId);
    } catch (error) {
      console.error('Failed to stop workflow:', error);
    }
  }, [workflowId]);

  const handleBackToEditor = useCallback(() => {
    router.push(`/editor/${workflowId}`);
  }, [router, workflowId]);

  // Expression test buttons (for development)
  const testExpressions = ['neutral', 'happy', 'sad', 'angry', 'surprised'];

  // Load models list
  const loadModels = useCallback(async () => {
    const response = await api.listModels();
    if (response.data) {
      setModels(response.data.models);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Handle file upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    const response = await api.uploadModel(file);

    if (response.data) {
      setAvatarConfig((prev) => ({ ...prev, modelUrl: response.data!.url }));
      loadModels();
    } else if (response.error) {
      setUploadError(response.error);
    }

    setUploading(false);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [loadModels]);

  // Handle model delete
  const handleDeleteModel = useCallback(async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;

    const response = await api.deleteModel(filename);
    if (response.data?.success) {
      loadModels();
      // Clear model URL if the deleted model was selected
      if (avatarConfig.modelUrl === `/models/${filename}`) {
        setAvatarConfig((prev) => ({ ...prev, modelUrl: '' }));
      }
    }
  }, [loadModels, avatarConfig.modelUrl]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="h-12 bg-black/50 backdrop-blur-sm border-b border-white/10 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToEditor}
            className="text-white/70 hover:text-white text-sm flex items-center gap-2"
          >
            ← Back to Editor
          </button>
          <h1 className="text-white text-sm font-medium">
            Preview: {workflow?.name || 'Loading...'}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div className={`flex items-center gap-2 text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>

          {/* Controls */}
          <button
            onClick={isRunning ? handleStop : handleStart}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              isRunning
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white'
            }`}
          >
            {isRunning ? '⏹ Stop' : '▶ Start'}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Avatar view */}
        <div className="flex-1 relative" style={{ backgroundColor: bgColor === 'transparent' ? '#0f172a' : bgColor }}>
          <AvatarView
            renderer={avatarConfig.renderer}
            modelUrl={avatarConfig.modelUrl}
            pngConfig={avatarConfig.pngConfig}
            vtubePort={avatarConfig.vtubePort}
            state={avatarState}
            showSubtitles={showSubtitles}
            subtitleText={subtitle}
            backgroundColor={bgColor}
            enableControls={showControls}
          />
        </div>

        {/* Side panel */}
        <div className="w-72 bg-black/30 border-l border-white/10 p-4 overflow-y-auto">
          <h2 className="text-white text-sm font-medium mb-4">Preview Settings</h2>

          {/* Avatar Config */}
          <div className="mb-6">
            <label className="text-white/50 text-xs uppercase tracking-wide">Renderer</label>
            <select
              value={avatarConfig.renderer}
              onChange={(e) => setAvatarConfig((prev) => ({ ...prev, renderer: e.target.value as RendererType }))}
              className="w-full mt-1 px-3 py-2 bg-black/30 border border-white/20 rounded text-white text-sm"
            >
              <option value="vrm">VRM (Built-in)</option>
              <option value="vtube-studio">VTube Studio</option>
              <option value="png">PNG Images</option>
            </select>
          </div>

          {/* Model URL (for VRM) */}
          {avatarConfig.renderer === 'vrm' && (
            <div className="mb-6">
              <label className="text-white/50 text-xs uppercase tracking-wide">VRM Model</label>

              {/* Upload button */}
              <div className="mt-2 flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".vrm"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 px-3 py-2 bg-purple-500/20 border border-purple-500/50 text-purple-300 rounded text-sm hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload VRM'}
                </button>
              </div>

              {uploadError && (
                <div className="mt-2 text-red-400 text-xs">{uploadError}</div>
              )}

              {/* Model selector */}
              {models.filter(m => m.type === 'vrm').length > 0 && (
                <div className="mt-3">
                  <label className="text-white/50 text-xs">Select Model</label>
                  <select
                    value={avatarConfig.modelUrl || ''}
                    onChange={(e) => setAvatarConfig((prev) => ({ ...prev, modelUrl: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 bg-black/30 border border-white/20 rounded text-white text-sm"
                  >
                    <option value="">-- Select --</option>
                    {models.filter(m => m.type === 'vrm').map((model) => (
                      <option key={model.filename} value={model.url}>
                        {model.filename} ({(model.size / 1024 / 1024).toFixed(1)}MB)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Model list with delete */}
              {models.filter(m => m.type === 'vrm').length > 0 && (
                <div className="mt-3 space-y-1">
                  <label className="text-white/50 text-xs">Uploaded Models</label>
                  {models.filter(m => m.type === 'vrm').map((model) => (
                    <div
                      key={model.filename}
                      className={`flex items-center justify-between px-2 py-1 rounded text-xs ${
                        avatarConfig.modelUrl === model.url
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-white/5 text-white/70'
                      }`}
                    >
                      <span className="truncate flex-1">{model.filename}</span>
                      <button
                        onClick={() => handleDeleteModel(model.filename)}
                        className="ml-2 text-red-400 hover:text-red-300"
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual URL input */}
              <div className="mt-3">
                <label className="text-white/50 text-xs">Or enter URL manually</label>
                <input
                  type="text"
                  value={avatarConfig.modelUrl || ''}
                  onChange={(e) => setAvatarConfig((prev) => ({ ...prev, modelUrl: e.target.value }))}
                  placeholder="/models/avatar.vrm"
                  className="w-full mt-1 px-3 py-2 bg-black/30 border border-white/20 rounded text-white text-sm"
                />
              </div>
            </div>
          )}

          {/* Background */}
          <div className="mb-6">
            <label className="text-white/50 text-xs uppercase tracking-wide">Background</label>
            <select
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-black/30 border border-white/20 rounded text-white text-sm"
            >
              <option value="transparent">Transparent</option>
              <option value="#0f172a">Dark Blue</option>
              <option value="#00ff00">Green Screen</option>
              <option value="#000000">Black</option>
              <option value="#ffffff">White</option>
            </select>
          </div>

          {/* Options */}
          <div className="mb-6 space-y-2">
            <label className="flex items-center gap-2 text-white/70 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showSubtitles}
                onChange={(e) => setShowSubtitles(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              Show Subtitles
            </label>
            <label className="flex items-center gap-2 text-white/70 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showControls}
                onChange={(e) => setShowControls(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              Enable 3D Controls
            </label>
          </div>

          {/* Expression Test (Development) */}
          <div className="mb-6">
            <label className="text-white/50 text-xs uppercase tracking-wide mb-2 block">
              Test Expression
            </label>
            <div className="flex flex-wrap gap-1">
              {testExpressions.map((expr) => (
                <button
                  key={expr}
                  onClick={() => setAvatarState((prev) => ({ ...prev, expression: expr }))}
                  className={`px-2 py-1 rounded text-xs ${
                    avatarState.expression === expr
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {expr}
                </button>
              ))}
            </div>
          </div>

          {/* Mouth Test (Development) */}
          <div className="mb-6">
            <label className="text-white/50 text-xs uppercase tracking-wide mb-2 block">
              Test Mouth Open: {(avatarState.mouthOpen * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={avatarState.mouthOpen}
              onChange={(e) => setAvatarState((prev) => ({ ...prev, mouthOpen: parseFloat(e.target.value) }))}
              className="w-full"
            />
          </div>

          {/* Current State Display */}
          <div className="p-3 bg-black/30 rounded">
            <div className="text-white/50 text-xs uppercase tracking-wide mb-2">Current State</div>
            <pre className="text-white/70 text-xs overflow-auto">
              {JSON.stringify(avatarState, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
