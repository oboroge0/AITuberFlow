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

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { AvatarView, AvatarState, RendererType } from '@/components/avatar';
import api from '@/lib/api';
import { resolveWorkflowId } from '@/lib/routeParams';
import { getApiBaseUrl, getWsBaseUrl } from '@/lib/runtimeEndpoints';
import { ReconnectingWebSocket } from '@/lib/reconnectingWebSocket';

const WS_URL = getWsBaseUrl();
const API_BASE = getApiBaseUrl();

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

export default function OverlayPage() {
  const params = useParams<{ id?: string | string[] }>();
  const workflowId = useMemo(() => resolveWorkflowId(params.id, 'overlay'), [params.id]);
  const searchParams = useSearchParams();

  // Avatar parameters
  const paramModel = searchParams.get('model');
  const paramAnimation = searchParams.get('animation');
  const paramScale = Math.max(0.1, Math.min(10, parseFloat(searchParams.get('scale') || '1') || 1));
  const paramX = Math.max(-1000, Math.min(1000, parseFloat(searchParams.get('x') || '0') || 0));
  const paramY = Math.max(-1000, Math.min(1000, parseFloat(searchParams.get('y') || '0') || 0));

  // Subtitle parameters
  const showSubtitles = searchParams.get('subtitle') !== 'false';
  const subPosition = searchParams.get('subPosition') || 'bottom';
  const subFontSize = Math.max(8, Math.min(200, parseInt(searchParams.get('subFontSize') || '28', 10) || 28));
  const subFontColor = searchParams.get('subFontColor') || '#ffffff';
  const subBgColor = searchParams.get('subBgColor') || 'rgba(0,0,0,0.7)';

  // Audio parameters
  const volume = Math.max(0, Math.min(1, (parseInt(searchParams.get('volume') || '100', 10) || 100) / 100));

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
  const subtitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const donationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const donationFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Force remount on navigation
  const [mountKey] = useState(() => Date.now());

  // Clear motion state after motion completes
  const handleMotionComplete = useCallback(() => {
    setAvatarState((prev) => ({ ...prev, motion: undefined }));
  }, []);

  // Load workflow config
  useEffect(() => {
    if (paramModel || !workflowId || workflowId === '_') return;

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
            const rawExprMap = avatarNode.config.vtubeExpressionMap ?? avatarNode.config.vtube_expression_map;
            if (rawExprMap) {
              try {
                expressionMap = typeof rawExprMap === 'string'
                  ? JSON.parse(rawExprMap)
                  : rawExprMap;
              } catch {
                console.warn('Failed to parse vtubeExpressionMap');
              }
            }

            setAvatarConfig({
              renderer: avatarNode.config.renderer || 'vrm',
              modelUrl: avatarNode.config.modelUrl || avatarNode.config.model_url,
              animationUrl: avatarNode.config.idleAnimation || avatarNode.config.idle_animation,
              vtubePort: avatarNode.config.vtubePort ?? avatarNode.config.vtube_port ?? 8001,
              vtubeMouthParam: avatarNode.config.vtubeMouthParam || avatarNode.config.vtube_mouth_param,
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
    if (!workflowId || workflowId === '_') return;

    const wsUrl = `${WS_URL.replace(/^http/, 'ws')}/ws`;

    // OBS Browser Sources run unattended (no one to hit "reload"), so the
    // overlay must keep retrying forever on disconnect rather than giving
    // up after a fixed number of attempts.
    const rws = new ReconnectingWebSocket({
      url: wsUrl,
      maxReconnectAttempts: Infinity,
      onStatusChange: (status) => {
        setConnected(status === 'connected');
        if (status === 'connecting') {
          console.log('[Overlay] Connecting');
        } else if (status === 'reconnecting') {
          console.log('[Overlay] Reconnecting');
        } else if (status === 'disconnected') {
          console.log('[Overlay] Disconnected');
        }
      },
      onOpen: () => {
        console.log('[Overlay] Connected');
        rws.send(JSON.stringify({ type: 'join', payload: { workflowId } }));
      },
      onMessage: (event) => {
        try {
          const data = JSON.parse(event.data);
          const { type, ...rest } = data;

          switch (type) {
            // Avatar events
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

            case 'avatar.update': {
              if (rest.renderer || rest.modelUrl || rest.idleAnimation || rest.vtubePort || rest.vtubeMouthParam || rest.vtubeExpressionMap) {
                let expressionMap: Record<string, string> | undefined;
                if (rest.vtubeExpressionMap) {
                  try {
                    expressionMap = typeof rest.vtubeExpressionMap === 'string'
                      ? JSON.parse(rest.vtubeExpressionMap)
                      : rest.vtubeExpressionMap;
                  } catch {
                    console.warn('Failed to parse vtubeExpressionMap');
                  }
                }

                setAvatarConfig((prev) => ({
                  renderer: rest.renderer || prev.renderer,
                  modelUrl: rest.modelUrl || prev.modelUrl,
                  animationUrl: rest.idleAnimation || prev.animationUrl,
                  vtubePort: rest.vtubePort || prev.vtubePort,
                  vtubeMouthParam: rest.vtubeMouthParam || prev.vtubeMouthParam,
                  vtubeExpressionMap: expressionMap || prev.vtubeExpressionMap,
                }));
              }
              // Whitelist known avatar state fields instead of spreading arbitrary data
              setAvatarState((prev) => {
                const updated: Partial<AvatarState> = {};
                if (rest.expression !== undefined) updated.expression = rest.expression;
                if (rest.mouthOpen !== undefined) updated.mouthOpen = rest.mouthOpen;
                if (rest.motion !== undefined) updated.motion = rest.motion;
                if (rest.lookAt !== undefined) updated.lookAt = rest.lookAt;
                return { ...prev, ...updated };
              });
              break;
            }

            // Subtitle events
            case 'subtitle': {
              if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
              if (subtitleFadeTimerRef.current) clearTimeout(subtitleFadeTimerRef.current);

              if (!rest.text) {
                setSubtitleVisible(false);
                subtitleFadeTimerRef.current = setTimeout(() => setSubtitle(null), 300);
                break;
              }

              setSubtitle(rest as SubtitleData);
              setSubtitleVisible(true);

              if (rest.duration && rest.duration > 0) {
                subtitleTimerRef.current = setTimeout(() => {
                  setSubtitleVisible(false);
                  subtitleFadeTimerRef.current = setTimeout(() => setSubtitle(null), 300);
                }, rest.duration);
              }
              break;
            }

            // Audio events
            case 'audio': {
              if (!rest.filename) break;
              const audioUrl = rest.filename.startsWith('http')
                ? rest.filename
                : `${API_BASE}/api/integrations/audio/${rest.filename}`;

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
              break;
            }

            case 'audio.play': {
              if (!rest.filename) break;
              const playUrl = rest.filename.startsWith('http')
                ? rest.filename
                : `${API_BASE}/api/integrations/audio/${rest.filename}`;

              if (audioRef.current) {
                audioRef.current.pause();
              }

              const playAudio = new Audio(playUrl);
              playAudio.volume = rest.volume ?? volume;
              audioRef.current = playAudio;

              playAudio.onended = () => {
                setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
              };

              playAudio.play().catch(console.error);
              break;
            }

            case 'audio.stop':
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
              }
              break;

            // Donation alert events
            case 'donation.alert': {
              const alertData = rest as DonationAlertData;
              setDonationAlert(alertData);
              setDonationAlertVisible(true);

              if (alertData.sound) {
                const soundUrl = alertData.sound.startsWith('http')
                  ? alertData.sound
                  : `${API_BASE}${alertData.sound}`;

                if (donationAudioRef.current) {
                  donationAudioRef.current.pause();
                }

                const alertAudio = new Audio(soundUrl);
                alertAudio.volume = volume;
                donationAudioRef.current = alertAudio;
                alertAudio.play().catch(console.error);
              }

              const duration = alertData.duration || 5000;
              if (donationTimerRef.current) clearTimeout(donationTimerRef.current);
              if (donationFadeTimerRef.current) clearTimeout(donationFadeTimerRef.current);
              donationTimerRef.current = setTimeout(() => {
                setDonationAlertVisible(false);
                donationFadeTimerRef.current = setTimeout(() => setDonationAlert(null), 500);
              }, duration);
              break;
            }

            // Execution events
            case 'execution.stopped':
              setAvatarState((prev) => ({ ...prev, mouthOpen: 0 }));
              setSubtitleVisible(false);
              if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
              subtitleFadeTimerRef.current = setTimeout(() => setSubtitle(null), 300);
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
              }
              break;
          }
        } catch (err) {
          console.warn('Failed to parse WebSocket message:', err);
        }
      },
    });

    rws.connect();

    return () => {
      rws.send(JSON.stringify({ type: 'leave', payload: { workflowId } }));
      rws.close();
      if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
      if (subtitleFadeTimerRef.current) clearTimeout(subtitleFadeTimerRef.current);
      if (donationTimerRef.current) clearTimeout(donationTimerRef.current);
      if (donationFadeTimerRef.current) clearTimeout(donationFadeTimerRef.current);
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
