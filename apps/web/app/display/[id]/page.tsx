'use client';

import React, { useEffect, useState, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import { AvatarView, AvatarState, RendererType } from '@/components/avatar';
import api from '@/lib/api';
import { Workflow } from '@/lib/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8001';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

// Helper to get full URL (backend serves uploaded files)
const getFullUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  // If it's already an absolute URL or a local public path (not API path), return as-is
  if (url.startsWith('http') || url.startsWith('/models/') || url.startsWith('/animations/')) {
    return url;
  }
  // If it's an API path, prepend the API base
  if (url.startsWith('/api/')) {
    return `${API_BASE}${url}`;
  }
  return url;
};

interface AvatarConfig {
  renderer: RendererType;
  modelUrl?: string;
  animationUrl?: string;
  vtubePort?: number;
  pngConfig?: {
    baseUrl: string;
    expressions: Record<string, string>;
    defaultExpression: string;
  };
}

interface DisplayPageProps {
  params: Promise<{ id: string }>;
}

export default function DisplayPage({ params }: DisplayPageProps) {
  const { id: workflowId } = use(params);
  const router = useRouter();

  const [connected, setConnected] = useState(false);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Avatar state
  const [avatarState, setAvatarState] = useState<AvatarState>({
    expression: 'neutral',
    mouthOpen: 0,
  });

  // Clear motion state after motion completes to allow same motion to be triggered again
  const handleMotionComplete = useCallback(() => {
    setAvatarState((prev) => ({ ...prev, motion: undefined }));
  }, []);

  // Avatar config (from workflow's avatar-configuration node)
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>({
    renderer: 'vrm',
    modelUrl: '/models/a1185aea_Flowchan.vrm',
  });

  // Subtitle state
  const [subtitle, setSubtitle] = useState('');

  // Unique key to force AvatarView remount on navigation
  const [mountKey] = useState(() => Date.now());

  // Audio playback
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load workflow data and extract avatar config from avatar-configuration node
  useEffect(() => {
    const loadWorkflowData = async () => {
      try {
        const response = await api.getWorkflow(workflowId);
        if (response.data) {
          setWorkflow(response.data);

          // Extract avatar config from avatar-configuration node
          const avatarNode = response.data.nodes.find((n) =>
            n.type === 'avatar-configuration' || n.type === 'avatar-controller'
          );

          if (avatarNode?.config) {
            setAvatarConfig({
              renderer: avatarNode.config.renderer || 'vrm',
              modelUrl: avatarNode.config.model_url || '/models/a1185aea_Flowchan.vrm',
              animationUrl: avatarNode.config.idle_animation,
              vtubePort: avatarNode.config.vtube_port,
              pngConfig: avatarNode.config.png_config
                ? JSON.parse(avatarNode.config.png_config)
                : undefined,
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
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket');
      setConnected(true);
      newSocket.emit('join', { workflowId });
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
      console.log('Received avatar.mouth:', data.value);
      setAvatarState((prev) => ({ ...prev, mouthOpen: data.value }));
    });

    newSocket.on('avatar.motion', (data: { motion?: string; motion_url?: string }) => {
      // Support both motion_url (new) and motion (legacy) for backward compatibility
      const motionUrl = data.motion_url || data.motion;
      if (motionUrl) {
        setAvatarState((prev) => ({ ...prev, motion: motionUrl }));
      }
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

    // Audio events - play generated audio
    newSocket.on('audio', (data: { filename: string; duration: number; text: string }) => {
      if (data.filename) {
        const audioUrl = `${API_BASE}/api/integrations/audio/${data.filename}`;
        console.log('Playing audio:', audioUrl);

        // Stop previous audio if playing
        if (audioRef.current) {
          audioRef.current.pause();
        }

        // Create and play new audio
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        // Close mouth when audio ends
        audio.onended = () => {
          setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
        };

        audio.play().catch((err) => {
          console.error('Failed to play audio:', err);
        });
      }
    });

    // Execution events
    newSocket.on('execution.started', () => {
      setIsRunning(true);
      // Reset mouth when starting
      setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
    });

    newSocket.on('execution.stopped', () => {
      setIsRunning(false);
      // Close mouth when stopping
      setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
    });

    return () => {
      newSocket.disconnect();
      // Stop any playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [workflowId]);

  // Control handlers
  const handleStart = useCallback(async () => {
    if (!workflow) {
      console.error('No workflow data loaded');
      return;
    }
    try {
      await api.startWorkflow(workflowId, {
        nodes: workflow.nodes,
        connections: workflow.connections,
        character: workflow.character,
      });
    } catch (error) {
      console.error('Failed to start workflow:', error);
    }
  }, [workflowId, workflow]);

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

  return (
    <div className="h-screen bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-12 flex-shrink-0 bg-black/50 backdrop-blur-sm border-b border-white/10 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToEditor}
            className="text-white/70 hover:text-white text-sm flex items-center gap-2"
          >
            ← Back to Editor
          </button>
          <h1 className="text-white text-sm font-medium">
            Display: {workflow?.name || 'Loading...'}
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
            {isRunning ? 'Stop' : 'Start'}
          </button>
        </div>
      </header>

      {/* Main content - Full screen avatar display */}
      <div className="flex-1 relative min-h-0 bg-slate-900">
        <AvatarView
          key={mountKey}
          renderer={avatarConfig.renderer}
          modelUrl={getFullUrl(avatarConfig.modelUrl)}
          animationUrl={getFullUrl(avatarConfig.animationUrl)}
          pngConfig={avatarConfig.pngConfig}
          vtubePort={avatarConfig.vtubePort}
          state={avatarState}
          showSubtitles={true}
          subtitleText={subtitle}
          backgroundColor="transparent"
          enableControls={true}
          showGrid={false}
          onMotionComplete={handleMotionComplete}
        />
      </div>
    </div>
  );
}
