'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AvatarState } from './AvatarView';

/**
 * VTube Studio API Bridge
 *
 * Connects to VTube Studio via WebSocket and translates
 * avatar events (expression, mouth, motion) to VTS parameters and hotkeys.
 *
 * Authentication tokens are cached in localStorage for persistent sessions.
 */

const PLUGIN_NAME = 'AITuberFlow';
const PLUGIN_DEVELOPER = 'AITuberFlow';
const API_NAME = 'VTubeStudioPublicAPI';
const API_VERSION = '1.0';

// VTS Parameter IDs for mouth control
const MOUTH_PARAM_IDS = ['MouthOpen', 'MouthOpenY', 'ParamMouthOpenY'];

// Expression to hotkey mapping (can be customized via props)
const DEFAULT_EXPRESSION_HOTKEY_MAP: Record<string, string> = {
  happy: 'Happy',
  sad: 'Sad',
  angry: 'Angry',
  surprised: 'Surprised',
  relaxed: 'Relaxed',
  neutral: 'Neutral',
};

interface VTSMessage {
  apiName: string;
  apiVersion: string;
  requestID: string;
  messageType: string;
  data?: Record<string, unknown>;
}

interface VTSResponse {
  apiName: string;
  apiVersion: string;
  timestamp: number;
  requestID: string;
  messageType: string;
  data?: Record<string, unknown>;
}

export interface VTubeStudioBridgeProps {
  port: number;
  state: AvatarState;
  expressionHotkeyMap?: Record<string, string>;
  mouthParamId?: string;
  onConnectionChange?: (connected: boolean, authenticated: boolean) => void;
  onError?: (error: string) => void;
  className?: string;
  showStatus?: boolean;
}

export default function VTubeStudioBridge({
  port,
  state,
  expressionHotkeyMap = DEFAULT_EXPRESSION_HOTKEY_MAP,
  mouthParamId,
  onConnectionChange,
  onError,
  className = '',
  showStatus = true,
}: VTubeStudioBridgeProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const requestIdRef = useRef(0);
  const pendingRequestsRef = useRef<Map<string, (response: VTSResponse) => void>>(new Map());

  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [status, setStatus] = useState('Disconnected');
  const [lastExpression, setLastExpression] = useState<string>('');

  // Token storage key
  const tokenKey = `vts_token_${port}`;

  // Generate unique request ID
  const generateRequestId = useCallback(() => {
    requestIdRef.current += 1;
    return `req_${requestIdRef.current}_${Date.now()}`;
  }, []);

  // Send message to VTS
  const sendMessage = useCallback((messageType: string, data?: Record<string, unknown>): Promise<VTSResponse> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = generateRequestId();
      const message: VTSMessage = {
        apiName: API_NAME,
        apiVersion: API_VERSION,
        requestID: requestId,
        messageType,
        data,
      };

      pendingRequestsRef.current.set(requestId, resolve);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (pendingRequestsRef.current.has(requestId)) {
          pendingRequestsRef.current.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 10000);

      wsRef.current.send(JSON.stringify(message));
    });
  }, [generateRequestId]);

  // Request authentication token
  const requestToken = useCallback(async (): Promise<string | null> => {
    try {
      setStatus('Requesting permission...');
      const response = await sendMessage('AuthenticationTokenRequest', {
        pluginName: PLUGIN_NAME,
        pluginDeveloper: PLUGIN_DEVELOPER,
      });

      if (response.data?.authenticationToken) {
        const token = response.data.authenticationToken as string;
        localStorage.setItem(tokenKey, token);
        return token;
      }
      return null;
    } catch (error) {
      console.error('[VTS] Token request failed:', error);
      return null;
    }
  }, [sendMessage, tokenKey]);

  // Authenticate with token
  const authenticate = useCallback(async (token: string): Promise<boolean> => {
    try {
      setStatus('Authenticating...');
      const response = await sendMessage('AuthenticationRequest', {
        pluginName: PLUGIN_NAME,
        pluginDeveloper: PLUGIN_DEVELOPER,
        authenticationToken: token,
      });

      return response.data?.authenticated === true;
    } catch (error) {
      console.error('[VTS] Authentication failed:', error);
      return false;
    }
  }, [sendMessage]);

  // Connect to VTube Studio
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('Connecting...');

    try {
      const ws = new WebSocket(`ws://localhost:${port}`);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log('[VTS] Connected to port', port);
        setConnected(true);
        setStatus('Connected');

        // Try to authenticate with cached token
        let token = localStorage.getItem(tokenKey);
        let authSuccess = false;

        if (token) {
          authSuccess = await authenticate(token);
        }

        // If no token or auth failed, request new token
        if (!authSuccess) {
          localStorage.removeItem(tokenKey);
          token = await requestToken();
          if (token) {
            authSuccess = await authenticate(token);
          }
        }

        if (authSuccess) {
          setAuthenticated(true);
          setStatus('Authenticated ✓');
          onConnectionChange?.(true, true);
        } else {
          setStatus('Authentication failed');
          onError?.('Failed to authenticate with VTube Studio');
          onConnectionChange?.(true, false);
        }
      };

      ws.onmessage = (event) => {
        try {
          const response: VTSResponse = JSON.parse(event.data);
          const callback = pendingRequestsRef.current.get(response.requestID);
          if (callback) {
            pendingRequestsRef.current.delete(response.requestID);
            callback(response);
          }
        } catch (error) {
          console.error('[VTS] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[VTS] WebSocket error:', error);
        setStatus('Connection error');
        onError?.('WebSocket connection error');
      };

      ws.onclose = () => {
        console.log('[VTS] Disconnected');
        setConnected(false);
        setAuthenticated(false);
        setStatus('Disconnected');
        onConnectionChange?.(false, false);

        // Attempt reconnect after 3 seconds
        setTimeout(() => {
          if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
            connect();
          }
        }, 3000);
      };
    } catch (error) {
      console.error('[VTS] Connection error:', error);
      setStatus('Connection failed');
      onError?.('Failed to connect to VTube Studio');
    }
  }, [port, tokenKey, authenticate, requestToken, onConnectionChange, onError]);

  // Set mouth parameter
  const setMouthOpen = useCallback(async (value: number) => {
    if (!authenticated) return;

    const paramId = mouthParamId || MOUTH_PARAM_IDS[0];
    const clampedValue = Math.max(0, Math.min(1, value));

    try {
      await sendMessage('InjectParameterDataRequest', {
        faceFound: true,
        mode: 'set',
        parameterValues: [
          {
            id: paramId,
            value: clampedValue,
          },
        ],
      });
    } catch (error) {
      // Silently fail for mouth updates (high frequency)
    }
  }, [authenticated, mouthParamId, sendMessage]);

  // Trigger expression hotkey
  const triggerExpression = useCallback(async (expression: string) => {
    if (!authenticated) return;

    const hotkeyId = expressionHotkeyMap[expression.toLowerCase()];
    if (!hotkeyId) {
      console.warn('[VTS] No hotkey mapped for expression:', expression);
      return;
    }

    try {
      await sendMessage('HotkeyTriggerRequest', {
        hotkeyID: hotkeyId,
      });
    } catch (error) {
      console.error('[VTS] Failed to trigger hotkey:', error);
    }
  }, [authenticated, expressionHotkeyMap, sendMessage]);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Update mouth when state changes
  useEffect(() => {
    setMouthOpen(state.mouthOpen);
  }, [state.mouthOpen, setMouthOpen]);

  // Update expression when state changes
  useEffect(() => {
    if (state.expression && state.expression !== lastExpression) {
      setLastExpression(state.expression);
      triggerExpression(state.expression);
    }
  }, [state.expression, lastExpression, triggerExpression]);

  // Handle motion (treat as hotkey trigger)
  useEffect(() => {
    if (state.motion && authenticated) {
      // Motion is treated as a hotkey name/ID
      sendMessage('HotkeyTriggerRequest', {
        hotkeyID: state.motion,
      }).catch(console.error);
    }
  }, [state.motion, authenticated, sendMessage]);

  if (!showStatus) {
    return null;
  }

  return (
    <div className={`vtube-studio-bridge flex flex-col items-center justify-center h-full ${className}`}>
      <div className="text-white/50 text-center">
        <div className="text-4xl mb-4">🎭</div>
        <div className="text-sm mb-2">VTube Studio</div>
        <div className={`text-xs ${authenticated ? 'text-green-400' : connected ? 'text-yellow-400' : 'text-red-400'}`}>
          {status}
        </div>
        <div className="mt-4 text-xs text-white/50 space-y-1">
          <div>Port: {port}</div>
          <div>Expression: {state.expression}</div>
          <div>Mouth: {(state.mouthOpen * 100).toFixed(0)}%</div>
        </div>
      </div>
    </div>
  );
}
