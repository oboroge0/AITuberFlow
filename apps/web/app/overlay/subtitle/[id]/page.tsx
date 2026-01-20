'use client';

/**
 * Subtitle Overlay Page
 *
 * Lightweight overlay for OBS Browser Source.
 * - Transparent background
 * - Displays subtitles only
 * - WebSocket connection for real-time subtitle updates
 *
 * Usage in OBS:
 *   URL: http://localhost:3000/overlay/subtitle/{workflowId}
 *   Width: 1920 (or your stream width)
 *   Height: 200 (adjust as needed)
 *
 * URL Parameters:
 *   - position: top, center, bottom (default: bottom)
 *   - fontSize: Font size in pixels (default: 28)
 *   - fontColor: Text color (default: #ffffff)
 *   - bgColor: Background color with alpha (default: rgba(0,0,0,0.7))
 *   - maxWidth: Maximum width in pixels (default: 80% of screen)
 *   - animation: none, fade, typewriter, slide (default: fade)
 *   - speaker: true/false - show speaker name (default: false)
 */

import React, { useEffect, useState, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8001';

interface SubtitleData {
  text: string;
  speaker?: string;
  style?: {
    preset?: string;
    position?: string;
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    animation?: string;
  };
  duration?: number;
}

interface OverlayPageProps {
  params: Promise<{ id: string }>;
}

export default function SubtitleOverlayPage({ params }: OverlayPageProps) {
  const { id: workflowId } = use(params);
  const searchParams = useSearchParams();

  // Get URL parameters with defaults
  const position = searchParams.get('position') || 'bottom';
  const fontSize = parseInt(searchParams.get('fontSize') || '28', 10);
  const fontColor = searchParams.get('fontColor') || '#ffffff';
  const bgColor = searchParams.get('bgColor') || 'rgba(0,0,0,0.7)';
  const maxWidth = searchParams.get('maxWidth') || '80%';
  const animation = searchParams.get('animation') || 'fade';
  const showSpeaker = searchParams.get('speaker') === 'true';

  const [subtitle, setSubtitle] = useState<SubtitleData | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // WebSocket connection
  useEffect(() => {
    const socket = io(WS_URL, {
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[Subtitle Overlay] Connected');
      socket.emit('join', { workflowId });
    });

    socket.on('disconnect', () => {
      console.log('[Subtitle Overlay] Disconnected');
    });

    // Listen for subtitle events
    socket.on('subtitle', (data: SubtitleData) => {
      if (!data.text) {
        // Empty text = hide subtitle
        setIsVisible(false);
        setTimeout(() => setSubtitle(null), 300); // Wait for fade out
        return;
      }

      setSubtitle(data);
      setIsVisible(true);

      // Auto-hide after duration if specified
      if (data.duration && data.duration > 0) {
        setTimeout(() => {
          setIsVisible(false);
          setTimeout(() => setSubtitle(null), 300);
        }, data.duration);
      }
    });

    // Clear subtitle on execution stop
    socket.on('execution.stopped', () => {
      setIsVisible(false);
      setTimeout(() => setSubtitle(null), 300);
    });

    return () => {
      socket.disconnect();
    };
  }, [workflowId]);

  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    top: {
      top: '5%',
      left: '50%',
      transform: 'translateX(-50%)',
    },
    center: {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    },
    bottom: {
      bottom: '10%',
      left: '50%',
      transform: 'translateX(-50%)',
    },
  };

  // Animation styles
  const getAnimationStyles = (): React.CSSProperties => {
    const baseTransition = 'opacity 0.3s ease, transform 0.3s ease';

    switch (animation) {
      case 'slide':
        return {
          transition: baseTransition,
          opacity: isVisible ? 1 : 0,
          transform: `${positionStyles[position]?.transform || ''} translateY(${isVisible ? '0' : '20px'})`,
        };
      case 'none':
        return {
          opacity: isVisible ? 1 : 0,
        };
      case 'fade':
      default:
        return {
          transition: baseTransition,
          opacity: isVisible ? 1 : 0,
        };
    }
  };

  // Get effective styles (URL params override subtitle-display node config)
  const effectiveStyle = {
    fontSize: subtitle?.style?.fontSize || fontSize,
    fontColor: subtitle?.style?.fontColor || fontColor,
    backgroundColor: subtitle?.style?.backgroundColor || bgColor,
  };

  if (!subtitle) {
    return <div className="w-screen h-screen" style={{ backgroundColor: 'transparent' }} />;
  }

  return (
    <div className="w-screen h-screen relative" style={{ backgroundColor: 'transparent' }}>
      <div
        className="absolute px-6 py-3 rounded-lg"
        style={{
          ...positionStyles[position],
          ...getAnimationStyles(),
          maxWidth,
          backgroundColor: effectiveStyle.backgroundColor,
        }}
      >
        {showSpeaker && subtitle.speaker && (
          <div
            className="text-sm mb-1 opacity-70"
            style={{ color: effectiveStyle.fontColor }}
          >
            {subtitle.speaker}
          </div>
        )}
        <div
          className="text-center whitespace-pre-wrap"
          style={{
            fontSize: effectiveStyle.fontSize,
            color: effectiveStyle.fontColor,
            textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
            lineHeight: 1.4,
          }}
        >
          {subtitle.text}
        </div>
      </div>
    </div>
  );
}
