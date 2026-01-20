'use client';

/**
 * Avatar Overlay Page
 *
 * Lightweight overlay for OBS Browser Source.
 * - Transparent background
 * - No UI controls
 * - WebSocket connection for real-time avatar updates
 *
 * Usage in OBS:
 *   URL: http://localhost:3000/overlay/avatar/{workflowId}
 *   Width: 1920 (or your stream width)
 *   Height: 1080 (or your stream height)
 *
 * URL Parameters:
 *   - model: VRM model URL (optional, uses workflow config if not specified)
 *   - animation: Idle animation URL (optional)
 *   - scale: Avatar scale multiplier (default: 1)
 *   - x: Horizontal position offset (default: 0)
 *   - y: Vertical position offset (default: 0)
 */

import React, { useEffect, useState, useRef, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { AvatarView, AvatarState } from '@/components/avatar';
import api from '@/lib/api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8001';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const getFullUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('http') || url.startsWith('/models/') || url.startsWith('/animations/')) {
    return url;
  }
  if (url.startsWith('/api/')) {
    return `${API_BASE}${url}`;
  }
  return url;
};

interface OverlayPageProps {
  params: Promise<{ id: string }>;
}

export default function AvatarOverlayPage({ params }: OverlayPageProps) {
  const { id: workflowId } = use(params);
  const searchParams = useSearchParams();

  // Get URL parameters
  const paramModel = searchParams.get('model');
  const paramAnimation = searchParams.get('animation');
  const paramScale = parseFloat(searchParams.get('scale') || '1');
  const paramX = parseFloat(searchParams.get('x') || '0');
  const paramY = parseFloat(searchParams.get('y') || '0');

  const [socket, setSocket] = useState<Socket | null>(null);
  const [modelUrl, setModelUrl] = useState<string | undefined>(paramModel || undefined);
  const [animationUrl, setAnimationUrl] = useState<string | undefined>(paramAnimation || undefined);

  const [avatarState, setAvatarState] = useState<AvatarState>({
    expression: 'neutral',
    mouthOpen: 0,
  });

  // Load workflow config if no URL params provided
  useEffect(() => {
    if (paramModel) return; // Skip if model specified via URL

    const loadWorkflowConfig = async () => {
      try {
        const response = await api.getWorkflow(workflowId);
        if (response.data) {
          // Look for avatar-controller or legacy avatar-display node
          const avatarNode = response.data.nodes.find((n) =>
            n.type === 'avatar-controller' || n.type === 'avatar-display'
          );

          if (avatarNode?.config) {
            setModelUrl(avatarNode.config.model_url || avatarNode.config.modelUrl);
            setAnimationUrl(avatarNode.config.idle_animation || avatarNode.config.animation_url);
          }
        }
      } catch (error) {
        console.error('Failed to load workflow config:', error);
      }
    };

    loadWorkflowConfig();
  }, [workflowId, paramModel]);

  // WebSocket connection
  useEffect(() => {
    const newSocket = io(WS_URL, {
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('[Avatar Overlay] Connected');
      newSocket.emit('join', { workflowId });
    });

    newSocket.on('disconnect', () => {
      console.log('[Avatar Overlay] Disconnected');
    });

    // Avatar events
    newSocket.on('avatar.expression', (data: { expression: string; intensity?: number }) => {
      setAvatarState((prev) => ({
        ...prev,
        expression: data.expression,
      }));
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

    newSocket.on('avatar.update', (data: Partial<AvatarState> & { model_url?: string; idle_animation?: string }) => {
      // Handle config updates from avatar-controller
      if (data.model_url) {
        setModelUrl(data.model_url);
      }
      if (data.idle_animation) {
        setAnimationUrl(data.idle_animation);
      }
      setAvatarState((prev) => ({ ...prev, ...data }));
    });

    // Reset mouth on execution stop
    newSocket.on('execution.stopped', () => {
      setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [workflowId]);

  return (
    <div
      className="w-screen h-screen overflow-hidden"
      style={{
        backgroundColor: 'transparent',
        transform: `translate(${paramX}px, ${paramY}px) scale(${paramScale})`,
        transformOrigin: 'center center',
      }}
    >
      <AvatarView
        renderer="vrm"
        modelUrl={getFullUrl(modelUrl)}
        animationUrl={getFullUrl(animationUrl)}
        state={avatarState}
        showSubtitles={false}
        subtitleText=""
        backgroundColor="transparent"
        enableControls={false}
        showGrid={false}
      />
    </div>
  );
}
