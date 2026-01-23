'use client';

/**
 * Unified Overlay Page
 *
 * All-in-one overlay for OBS Browser Source.
 * - Avatar display (VRM/PNG/VTube Studio)
 * - Subtitle display
 * - Audio playback
 * - Transparent background
 * - WebSocket connection for real-time updates
 *
 * Usage in OBS:
 *   URL: http://localhost:3000/overlay/{workflowId}
 *   Width: 1920 (or your stream width)
 *   Height: 1080 (or your stream height)
 *
 * URL Parameters:
 *   Avatar:
 *     - model: VRM model URL (optional, uses workflow config if not specified)
 *     - animation: Idle animation URL (optional)
 *     - scale: Avatar scale multiplier (default: 1)
 *     - x: Horizontal position offset (default: 0)
 *     - y: Vertical position offset (default: 0)
 *   Subtitle:
 *     - subtitle: true/false - show subtitles (default: true)
 *     - subPosition: top, center, bottom (default: bottom)
 *     - subFontSize: Font size in pixels (default: 28)
 *     - subFontColor: Text color (default: #ffffff)
 *     - subBgColor: Background color (default: rgba(0,0,0,0.7))
 *   Audio:
 *     - volume: Audio volume 0-100 (default: 100)
 *   Debug:
 *     - debug: Show connection status (default: false)
 */

import React, { useEffect, useState, useCallback, useRef, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { AvatarView, AvatarState, RendererType } from '@/components/avatar';
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

interface SubtitleData {
  text: string;
  speaker?: string;
  duration?: number;
}

interface DonationAlertData {
  text: string;
  author: string;
  amount: number;
  currency: string;
  message?: string;
  sound?: string;
  duration?: number;
  style?: 'default' | 'minimal' | 'fancy';
}

interface AvatarConfig {
  renderer: RendererType;
  modelUrl?: string;
  animationUrl?: string;
  vtubePort?: number;
  vtubeMouthParam?: string;
  vtubeExpressionMap?: Record<string, string>;
}

interface OverlayPageProps {
  params: Promise<{ id: string }>;
}

export default function OverlayPage({ params }: OverlayPageProps) {
  const { id: workflowId } = use(params);
  const searchParams = useSearchParams();

  // Avatar parameters
  const paramModel = searchParams.get('model');
  const paramAnimation = searchParams.get('animation');
  const paramScale = parseFloat(searchParams.get('scale') || '1');
  const paramX = parseFloat(searchParams.get('x') || '0');
  const paramY = parseFloat(searchParams.get('y') || '0');

  // Subtitle parameters
  const showSubtitles = searchParams.get('subtitle') !== 'false';
  const subPosition = searchParams.get('subPosition') || 'bottom';
  const subFontSize = parseInt(searchParams.get('subFontSize') || '28', 10);
  const subFontColor = searchParams.get('subFontColor') || '#ffffff';
  const subBgColor = searchParams.get('subBgColor') || 'rgba(0,0,0,0.7)';

  // Audio parameters
  const volume = parseInt(searchParams.get('volume') || '100', 10) / 100;

  // Debug
  const debug = searchParams.get('debug') === 'true';

  // State
  const [connected, setConnected] = useState(false);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>({
    renderer: 'vrm',
    modelUrl: paramModel || undefined,
    animationUrl: paramAnimation || undefined,
    vtubePort: 8001,
  });

  const [avatarState, setAvatarState] = useState<AvatarState>({
    expression: 'neutral',
    mouthOpen: 0,
  });

  const [subtitle, setSubtitle] = useState<SubtitleData | null>(null);
  const [subtitleVisible, setSubtitleVisible] = useState(false);

  const [donationAlert, setDonationAlert] = useState<DonationAlertData | null>(null);
  const [donationAlertVisible, setDonationAlertVisible] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const donationAudioRef = useRef<HTMLAudioElement | null>(null);

  // Force remount on navigation
  const [mountKey] = useState(() => Date.now());

  // Clear motion state after motion completes
  const handleMotionComplete = useCallback(() => {
    setAvatarState((prev) => ({ ...prev, motion: undefined }));
  }, []);

  // Load workflow config
  useEffect(() => {
    if (paramModel) return;

    const loadWorkflowConfig = async () => {
      try {
        const response = await api.getWorkflow(workflowId);
        if (response.data) {
          const avatarNode = response.data.nodes.find((n) =>
            n.type === 'avatar-configuration' || n.type === 'avatar-controller'
          );

          if (avatarNode?.config) {
            // Parse VTube Studio expression map if it's a string
            let expressionMap: Record<string, string> | undefined;
            if (avatarNode.config.vtube_expression_map) {
              try {
                expressionMap = typeof avatarNode.config.vtube_expression_map === 'string'
                  ? JSON.parse(avatarNode.config.vtube_expression_map)
                  : avatarNode.config.vtube_expression_map;
              } catch {
                console.warn('Failed to parse vtube_expression_map');
              }
            }

            setAvatarConfig({
              renderer: avatarNode.config.renderer || 'vrm',
              modelUrl: avatarNode.config.model_url,
              animationUrl: avatarNode.config.idle_animation,
              vtubePort: avatarNode.config.vtube_port || 8001,
              vtubeMouthParam: avatarNode.config.vtube_mouth_param,
              vtubeExpressionMap: expressionMap,
            });
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
    const socket = io(WS_URL, {
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[Overlay] Connected');
      setConnected(true);
      socket.emit('join', { workflowId });
    });

    socket.on('disconnect', () => {
      console.log('[Overlay] Disconnected');
      setConnected(false);
    });

    // Avatar events
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

    socket.on('avatar.update', (data: Partial<AvatarState> & {
      model_url?: string;
      idle_animation?: string;
      renderer?: RendererType;
      vtube_port?: number;
      vtube_mouth_param?: string;
      vtube_expression_map?: string | Record<string, string>;
    }) => {
      if (data.renderer || data.model_url || data.idle_animation || data.vtube_port) {
        // Parse VTube Studio expression map if it's a string
        let expressionMap: Record<string, string> | undefined;
        if (data.vtube_expression_map) {
          try {
            expressionMap = typeof data.vtube_expression_map === 'string'
              ? JSON.parse(data.vtube_expression_map)
              : data.vtube_expression_map;
          } catch {
            console.warn('Failed to parse vtube_expression_map');
          }
        }

        setAvatarConfig((prev) => ({
          renderer: data.renderer || prev.renderer,
          modelUrl: data.model_url || prev.modelUrl,
          animationUrl: data.idle_animation || prev.animationUrl,
          vtubePort: data.vtube_port || prev.vtubePort,
          vtubeMouthParam: data.vtube_mouth_param || prev.vtubeMouthParam,
          vtubeExpressionMap: expressionMap || prev.vtubeExpressionMap,
        }));
      }
      setAvatarState((prev) => ({ ...prev, ...data }));
    });

    // Subtitle events
    socket.on('subtitle', (data: SubtitleData) => {
      if (!data.text) {
        setSubtitleVisible(false);
        setTimeout(() => setSubtitle(null), 300);
        return;
      }

      setSubtitle(data);
      setSubtitleVisible(true);

      if (data.duration && data.duration > 0) {
        setTimeout(() => {
          setSubtitleVisible(false);
          setTimeout(() => setSubtitle(null), 300);
        }, data.duration);
      }
    });

    // Audio events
    socket.on('audio', (data: { filename: string; duration?: number }) => {
      if (!data.filename) return;

      const audioUrl = data.filename.startsWith('http')
        ? data.filename
        : `${API_BASE}/api/integrations/audio/${data.filename}`;

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audio.volume = volume;
      audioRef.current = audio;

      audio.onended = () => {
        setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
      };

      audio.play().catch(console.error);
    });

    socket.on('audio.play', (data: { filename: string; volume?: number }) => {
      if (!data.filename) return;

      const audioUrl = data.filename.startsWith('http')
        ? data.filename
        : `${API_BASE}/api/integrations/audio/${data.filename}`;

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audio.volume = data.volume ?? volume;
      audioRef.current = audio;

      audio.onended = () => {
        setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
      };

      audio.play().catch(console.error);
    });

    socket.on('audio.stop', () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    });

    // Donation alert events
    socket.on('donation.alert', (data: DonationAlertData) => {
      setDonationAlert(data);
      setDonationAlertVisible(true);

      // Play alert sound if provided
      if (data.sound) {
        const soundUrl = data.sound.startsWith('http')
          ? data.sound
          : `${API_BASE}${data.sound}`;

        if (donationAudioRef.current) {
          donationAudioRef.current.pause();
        }

        const audio = new Audio(soundUrl);
        audio.volume = volume;
        donationAudioRef.current = audio;
        audio.play().catch(console.error);
      }

      // Hide after duration
      const duration = data.duration || 5000;
      setTimeout(() => {
        setDonationAlertVisible(false);
        setTimeout(() => setDonationAlert(null), 500);
      }, duration);
    });

    // Execution events
    socket.on('execution.stopped', () => {
      setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
      setSubtitleVisible(false);
      setTimeout(() => setSubtitle(null), 300);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    });

    return () => {
      socket.disconnect();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (donationAudioRef.current) {
        donationAudioRef.current.pause();
        donationAudioRef.current = null;
      }
    };
  }, [workflowId, volume]);

  // Subtitle position styles
  const subtitlePositionStyles: Record<string, React.CSSProperties> = {
    top: { top: '5%', left: '50%', transform: 'translateX(-50%)' },
    center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
    bottom: { bottom: '10%', left: '50%', transform: 'translateX(-50%)' },
  };

  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ backgroundColor: 'transparent' }}
    >
      {/* Avatar Layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${paramX}px, ${paramY}px) scale(${paramScale})`,
          transformOrigin: 'center center',
        }}
      >
        <AvatarView
          key={mountKey}
          renderer={avatarConfig.renderer}
          modelUrl={getFullUrl(avatarConfig.modelUrl)}
          animationUrl={getFullUrl(avatarConfig.animationUrl)}
          vtubePort={avatarConfig.vtubePort}
          vtubeMouthParam={avatarConfig.vtubeMouthParam}
          vtubeExpressionMap={avatarConfig.vtubeExpressionMap}
          state={avatarState}
          showSubtitles={false}
          backgroundColor="transparent"
          enableControls={false}
          showGrid={false}
          onMotionComplete={handleMotionComplete}
        />
      </div>

      {/* Subtitle Layer */}
      {showSubtitles && subtitle && (
        <div
          className="absolute px-6 py-3 rounded-lg transition-opacity duration-300"
          style={{
            ...subtitlePositionStyles[subPosition],
            opacity: subtitleVisible ? 1 : 0,
            maxWidth: '80%',
            backgroundColor: subBgColor,
          }}
        >
          {subtitle.speaker && (
            <div
              className="text-sm mb-1 opacity-70"
              style={{ color: subFontColor }}
            >
              {subtitle.speaker}
            </div>
          )}
          <div
            className="text-center whitespace-pre-wrap"
            style={{
              fontSize: subFontSize,
              color: subFontColor,
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
              lineHeight: 1.4,
            }}
          >
            {subtitle.text}
          </div>
        </div>
      )}

      {/* Donation Alert Layer */}
      {donationAlert && (
        <div
          className={`absolute top-1/4 left-1/2 -translate-x-1/2 transition-all duration-500 ${
            donationAlertVisible
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-95'
          }`}
        >
          <div
            className={`px-8 py-6 rounded-2xl text-center ${
              donationAlert.style === 'minimal'
                ? 'bg-black/80'
                : donationAlert.style === 'fancy'
                ? 'bg-gradient-to-br from-yellow-500/90 via-orange-500/90 to-red-500/90'
                : 'bg-gradient-to-br from-purple-600/90 to-pink-600/90'
            }`}
            style={{
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              minWidth: '300px',
            }}
          >
            {/* Icon */}
            <div className="text-5xl mb-3">
              {donationAlert.style === 'fancy' ? '🎉' : '💰'}
            </div>

            {/* Amount */}
            <div
              className="text-4xl font-bold text-white mb-2"
              style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}
            >
              {donationAlert.amount} {donationAlert.currency}
            </div>

            {/* Author */}
            <div
              className="text-xl text-white/90 mb-2"
              style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}
            >
              {donationAlert.author}
            </div>

            {/* Message */}
            {donationAlert.message && (
              <div
                className="text-lg text-white/80 mt-3 italic"
                style={{
                  maxWidth: '400px',
                  wordWrap: 'break-word',
                }}
              >
                &ldquo;{donationAlert.message}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debug Info */}
      {debug && (
        <div className="absolute top-2 left-2 bg-black/70 rounded px-2 py-1 text-xs text-white">
          <div>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</div>
          <div>Renderer: {avatarConfig.renderer}</div>
          <div>Expression: {avatarState.expression}</div>
          <div>Mouth: {(avatarState.mouthOpen * 100).toFixed(0)}%</div>
        </div>
      )}
    </div>
  );
}
