import { useEffect, useRef, useCallback, useState } from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';
import { AvatarState } from '@/components/avatar';
import { getApiBaseUrl, getWsBaseUrl, ensureDevPortResolved } from '@/lib/runtimeEndpoints';

// Reconnection settings with exponential backoff
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
const JITTER_FACTOR = 0.5;

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting';

/**
 * Native WebSocket hook replacing Socket.IO.
 *
 * Connects to the Hono WebSocket endpoint and handles
 * workflow events, avatar state, and audio playback.
 */
export function useWebSocket(workflowId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addLog, setNodeStatus, setExecuting } = useWorkflowStore();

  // Avatar state for preview
  const [avatarState, setAvatarState] = useState<AvatarState>({
    expression: 'neutral',
    mouthOpen: 0,
  });

  // Connection status for UI feedback
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const reconnectAttemptRef = useRef(0);
  const workflowIdRef = useRef(workflowId);

  // Keep workflowId ref in sync
  useEffect(() => {
    workflowIdRef.current = workflowId;
  }, [workflowId]);

  useEffect(() => {
    if (!workflowId) return;

    let intentionalClose = false;

    function getWsUrl(): string {
      // Read the (possibly auto-switched) port lazily at connect time.
      const base = getWsBaseUrl().replace(/^http/, 'ws');
      return `${base}/ws`;
    }

    function connect() {
      setConnectionStatus(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');

      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        setReconnectAttempt(0);
        reconnectAttemptRef.current = 0;

        // Join the workflow room
        ws.send(JSON.stringify({
          type: 'join',
          payload: { workflowId: workflowIdRef.current },
        }));

        addLog({ level: 'info', message: 'サーバーに接続しました / Connected to server' });
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setConnectionStatus('disconnected');

        if (!intentionalClose) {
          addLog({
            level: 'warning',
            message: `サーバーから切断されました / Disconnected from server: ${event.reason || event.code}`,
          });
          scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (reconnectAttemptRef.current === 0) {
          addLog({
            level: 'warning',
            message: '接続エラー / Connection error',
          });
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (err) {
          console.warn('Failed to parse WebSocket message:', err);
        }
      };
    }

    function scheduleReconnect() {
      if (intentionalClose) return;

      const attempt = reconnectAttemptRef.current + 1;
      if (attempt > MAX_RECONNECT_ATTEMPTS) {
        console.log('Reconnection failed after all attempts');
        setConnectionStatus('disconnected');
        addLog({
          level: 'error',
          message: '再接続に失敗しました。ページを再読み込みしてください / Reconnection failed. Please reload the page.',
        });
        return;
      }

      reconnectAttemptRef.current = attempt;
      setReconnectAttempt(attempt);
      setConnectionStatus('reconnecting');

      // Exponential backoff with jitter
      const baseDelay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, attempt - 1), MAX_RECONNECT_DELAY);
      const jitter = baseDelay * JITTER_FACTOR * Math.random();
      const delay = baseDelay + jitter;

      console.log(`Reconnection attempt ${attempt}, delay: ${Math.round(delay)}ms`);
      addLog({
        level: 'info',
        message: `再接続を試行中... (${attempt}/${MAX_RECONNECT_ATTEMPTS}) / Reconnecting...`,
      });

      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    }

    // Sequential playback: consecutive TTS outputs are queued so an utterance
    // is never cut off by the next one arriving mid-playback.
    function enqueueAudio(url: string) {
      audioQueueRef.current.push(url);
      if (!audioRef.current) {
        playNextAudio();
      }
    }

    // Drop everything queued and silence the current utterance. A new run
    // (or an explicit stop) must not keep playing audio from the previous run.
    function clearAudioPlayback() {
      audioQueueRef.current = [];
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
    }

    function playNextAudio() {
      const nextUrl = audioQueueRef.current.shift();
      if (!nextUrl) {
        audioRef.current = null;
        return;
      }

      const audio = new Audio(nextUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
        playNextAudio();
      };

      audio.play().catch((err) => {
        console.error('Failed to play audio:', err);
        addLog({
          level: 'warning',
          message: `Audio playback failed: ${err.message}`,
        });
        playNextAudio();
      });
    }

    function handleMessage(data: any) {
      const { type, ...rest } = data;

      switch (type) {
        case 'log':
          addLog({
            level: rest.level as 'info' | 'warning' | 'error' | 'debug',
            message: rest.message,
            nodeId: rest.nodeId,
          });
          break;

        case 'node.status':
          setNodeStatus(
            rest.nodeId,
            rest.status as 'idle' | 'running' | 'completed' | 'error',
            rest.data,
          );
          break;

        case 'execution.started':
          clearAudioPlayback();
          setExecuting(true);
          addLog({ level: 'info', message: 'Workflow execution started' });
          break;

        case 'execution.stopped':
          clearAudioPlayback();
          setExecuting(false);
          addLog({
            level: 'info',
            message: `Workflow execution stopped${rest.reason ? `: ${rest.reason}` : ''}`,
          });
          break;

        case 'execution.error':
          addLog({
            level: 'error',
            message: rest.error,
            nodeId: rest.nodeId,
          });
          break;

        case 'audio':
          if (rest.filename) {
            const audioUrl = `${getApiBaseUrl()}/api/integrations/audio/${rest.filename}`;
            addLog({
              level: 'info',
              message: `${audioRef.current ? 'Queued' : 'Playing'} audio: ${rest.text?.substring(0, 30) || 'audio'}...`,
            });
            enqueueAudio(audioUrl);
          }
          break;

        case 'avatar.expression':
          setAvatarState((prev) => ({ ...prev, expression: rest.expression }));
          break;

        case 'avatar.mouth':
          setAvatarState((prev) => ({ ...prev, mouthOpen: rest.value }));
          break;

        case 'avatar.motion': {
          const motionUrl = rest.motionUrl || rest.motion;
          if (motionUrl) {
            setAvatarState((prev) => ({ ...prev, motion: motionUrl }));
          }
          break;
        }

        case 'avatar.lookAt':
          setAvatarState((prev) => ({ ...prev, lookAt: rest }));
          break;

        case 'avatar.update':
          setAvatarState((prev) => ({ ...prev, ...rest }));
          break;

        case 'subtitle':
          // Subtitles are handled via the existing subtitle display mechanism
          break;
      }
    }

    // Ensure the backend port is resolved before the first connection so we
    // don't attempt ws://localhost:8001 when the server auto-switched ports.
    ensureDevPortResolved().then(() => {
      if (!intentionalClose) connect();
    });

    return () => {
      intentionalClose = true;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (wsRef.current) {
        // Send leave message before closing
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'leave',
            payload: { workflowId },
          }));
        }
        wsRef.current.close();
        wsRef.current = null;
      }

      audioQueueRef.current = [];
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [workflowId, addLog, setNodeStatus, setExecuting]);

  const emit = useCallback((event: string, data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: event,
        payload: data,
      }));
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
