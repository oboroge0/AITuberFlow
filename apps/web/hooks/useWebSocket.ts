import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useWorkflowStore } from '@/stores/workflowStore';
import { AvatarState } from '@/components/avatar';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8001';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

// Reconnection settings with exponential backoff
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting';

export function useWebSocket(workflowId: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { addLog, setNodeStatus, setExecuting } = useWorkflowStore();

  // Avatar state for preview
  const [avatarState, setAvatarState] = useState<AvatarState>({
    expression: 'neutral',
    mouthOpen: 0,
  });

  // Connection status for UI feedback
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  // Ref to track reconnect attempts for use in callbacks (avoids stale closure)
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    if (!workflowId) return;

    setConnectionStatus('connecting');

    // Connect to WebSocket server with custom reconnection settings
    const socket = io(WS_URL, {
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: INITIAL_RECONNECT_DELAY,
      reconnectionDelayMax: MAX_RECONNECT_DELAY,
      randomizationFactor: 0.5, // Add jitter to prevent thundering herd
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      setReconnectAttempt(0);
      reconnectAttemptRef.current = 0;
      socket.emit('join', { workflowId });
      addLog({ level: 'info', message: 'サーバーに接続しました / Connected to server' });
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnectionStatus('disconnected');
      // Only log if it's an unexpected disconnect
      if (reason !== 'io client disconnect') {
        addLog({
          level: 'warning',
          message: `サーバーから切断されました / Disconnected from server: ${reason}`,
        });
      }
    });

    socket.on('reconnect_attempt', (attempt) => {
      setConnectionStatus('reconnecting');
      setReconnectAttempt(attempt);
      reconnectAttemptRef.current = attempt;
      const delay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, attempt - 1), MAX_RECONNECT_DELAY);
      console.log(`Reconnection attempt ${attempt}, next delay: ${delay}ms`);
      addLog({
        level: 'info',
        message: `再接続を試行中... (${attempt}/${MAX_RECONNECT_ATTEMPTS}) / Reconnecting...`,
      });
    });

    socket.on('reconnect', (attempt) => {
      console.log('Reconnected after', attempt, 'attempts');
      setConnectionStatus('connected');
      setReconnectAttempt(0);
      addLog({
        level: 'info',
        message: `再接続に成功しました / Reconnected successfully`,
      });
    });

    socket.on('reconnect_failed', () => {
      console.log('Reconnection failed after all attempts');
      setConnectionStatus('disconnected');
      addLog({
        level: 'error',
        message: `再接続に失敗しました。ページを再読み込みしてください / Reconnection failed. Please reload the page.`,
      });
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error.message);
      // Only log on first error to avoid spam
      if (reconnectAttemptRef.current === 0) {
        addLog({
          level: 'warning',
          message: `接続エラー / Connection error: ${error.message}`,
        });
      }
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

  // Update avatar state locally (for immediate feedback)
  const updateAvatarState = useCallback((update: Partial<AvatarState>) => {
    setAvatarState((prev) => ({ ...prev, ...update }));
  }, []);

  return {
    emit,
    avatarState,
    clearMotion,
    updateAvatarState,
    connectionStatus,
    reconnectAttempt,
  };
}
