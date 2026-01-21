import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useWorkflowStore } from '@/stores/workflowStore';
import { AvatarState } from '@/components/avatar';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8001';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

export function useWebSocket(workflowId: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { addLog, setNodeStatus, setExecuting } = useWorkflowStore();

  // Avatar state for preview
  const [avatarState, setAvatarState] = useState<AvatarState>({
    expression: 'neutral',
    mouthOpen: 0,
  });

  useEffect(() => {
    if (!workflowId) return;

    // Connect to WebSocket server
    const socket = io(WS_URL, {
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
      socket.emit('join', { workflowId });
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    // Handle log events
    socket.on('log', (data: { level: string; message: string; nodeId?: string }) => {
      addLog({
        level: data.level as 'info' | 'warning' | 'error' | 'debug',
        message: data.message,
        nodeId: data.nodeId,
      });
    });

    // Handle node status updates
    socket.on('node.status', (data: { nodeId: string; status: string; data?: any }) => {
      setNodeStatus(
        data.nodeId,
        data.status as 'idle' | 'running' | 'completed' | 'error',
        data.data
      );
    });

    // Handle execution events
    socket.on('execution.started', () => {
      setExecuting(true);
      addLog({ level: 'info', message: 'Workflow execution started' });
    });

    socket.on('execution.stopped', (data: { reason?: string }) => {
      setExecuting(false);
      addLog({
        level: 'info',
        message: `Workflow execution stopped${data.reason ? `: ${data.reason}` : ''}`,
      });
    });

    socket.on('execution.error', (data: { nodeId?: string; error: string }) => {
      addLog({
        level: 'error',
        message: data.error,
        nodeId: data.nodeId,
      });
    });

    // Handle audio events - play generated audio
    socket.on('audio', (data: { filename: string; duration: number; text: string }) => {
      if (data.filename) {
        const audioUrl = `${API_URL}/api/integrations/audio/${data.filename}`;
        addLog({
          level: 'info',
          message: `Playing audio: ${data.text?.substring(0, 30) || 'audio'}...`,
        });

        // Create and play audio
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        // Close mouth when audio ends
        audio.onended = () => {
          setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
        };

        audio.play().catch((err) => {
          console.error('Failed to play audio:', err);
          addLog({
            level: 'warning',
            message: `Audio playback failed: ${err.message}`,
          });
        });
      }
    });

    // Handle avatar events
    socket.on('avatar.expression', (data: { expression: string }) => {
      setAvatarState((prev) => ({ ...prev, expression: data.expression }));
    });

    socket.on('avatar.mouth', (data: { value: number }) => {
      setAvatarState((prev) => ({ ...prev, mouthOpen: data.value }));
    });

    socket.on('avatar.motion', (data: { motion?: string; motion_url?: string }) => {
      const motionUrl = data.motion_url || data.motion;
      if (motionUrl) {
        setAvatarState((prev) => ({ ...prev, motion: motionUrl }));
      }
    });

    socket.on('avatar.lookAt', (data: { x: number; y: number }) => {
      setAvatarState((prev) => ({ ...prev, lookAt: data }));
    });

    socket.on('avatar.update', (data: Partial<AvatarState>) => {
      setAvatarState((prev) => ({ ...prev, ...data }));
    });

    return () => {
      socket.emit('leave', { workflowId });
      socket.disconnect();
      socketRef.current = null;
      // Stop any playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [workflowId, addLog, setNodeStatus, setExecuting]);

  const emit = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  // Clear motion after it completes
  const clearMotion = useCallback(() => {
    setAvatarState((prev) => ({ ...prev, motion: undefined }));
  }, []);

  return { emit, avatarState, clearMotion };
}
