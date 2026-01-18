import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useWorkflowStore } from '@/stores/workflowStore';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8001';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

export function useWebSocket(workflowId: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { addLog, setNodeStatus, setExecuting } = useWorkflowStore();

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
        data.status as 'idle' | 'running' | 'success' | 'error',
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
        audio.play().catch((err) => {
          console.error('Failed to play audio:', err);
          addLog({
            level: 'warning',
            message: `Audio playback failed: ${err.message}`,
          });
        });
      }
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

  return { emit };
}
