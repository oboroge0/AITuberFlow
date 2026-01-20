'use client';

/**
 * Audio Overlay Page
 *
 * Invisible overlay for audio playback in OBS.
 * - No visual elements (transparent)
 * - WebSocket connection for audio events
 * - Plays audio files from backend
 *
 * Usage in OBS:
 *   URL: http://localhost:3000/overlay/audio/{workflowId}
 *   Width: 1
 *   Height: 1
 *   (Size doesn't matter as this is invisible)
 *
 * URL Parameters:
 *   - volume: Audio volume 0-100 (default: 100)
 *   - debug: Show debug info (default: false)
 */

import React, { useEffect, useState, useRef, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8001';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

interface AudioPlayEvent {
  filename: string;
  duration?: number;
  volume?: number;
  text?: string;
}

interface OverlayPageProps {
  params: Promise<{ id: string }>;
}

export default function AudioOverlayPage({ params }: OverlayPageProps) {
  const { id: workflowId } = use(params);
  const searchParams = useSearchParams();

  const volume = parseInt(searchParams.get('volume') || '100', 10) / 100;
  const debug = searchParams.get('debug') === 'true';

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // WebSocket connection
  useEffect(() => {
    const socket = io(WS_URL, {
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[Audio Overlay] Connected');
      socket.emit('join', { workflowId });
    });

    socket.on('disconnect', () => {
      console.log('[Audio Overlay] Disconnected');
    });

    // Listen for audio events
    socket.on('audio.play', (data: AudioPlayEvent) => {
      if (!data.filename) return;

      // Build audio URL
      const audioUrl = data.filename.startsWith('http')
        ? data.filename
        : `${API_BASE}/api/integrations/audio/${data.filename}`;

      console.log('[Audio Overlay] Playing:', audioUrl);

      // Stop previous audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Create and play new audio
      const audio = new Audio(audioUrl);
      audio.volume = data.volume !== undefined ? data.volume : volume;
      audioRef.current = audio;

      setCurrentFile(data.filename);
      setIsPlaying(true);

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentFile(null);
      };

      audio.onerror = (e) => {
        console.error('[Audio Overlay] Playback error:', e);
        setIsPlaying(false);
        setCurrentFile(null);
      };

      audio.play().catch((err) => {
        console.error('[Audio Overlay] Failed to play:', err);
        setIsPlaying(false);
      });
    });

    socket.on('audio.stop', () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setIsPlaying(false);
        setCurrentFile(null);
      }
    });

    // Also listen for legacy 'audio' event for backward compatibility
    socket.on('audio', (data: { filename: string; duration: number; text: string }) => {
      if (!data.filename) return;

      const audioUrl = `${API_BASE}/api/integrations/audio/${data.filename}`;
      console.log('[Audio Overlay] Playing (legacy):', audioUrl);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audio.volume = volume;
      audioRef.current = audio;

      setCurrentFile(data.filename);
      setIsPlaying(true);

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentFile(null);
      };

      audio.play().catch(console.error);
    });

    // Stop audio on execution stop
    socket.on('execution.stopped', () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setIsPlaying(false);
        setCurrentFile(null);
      }
    });

    return () => {
      socket.disconnect();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [workflowId, volume]);

  // Debug mode shows status
  if (debug) {
    return (
      <div
        className="w-screen h-screen flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      >
        <div className="text-white text-center">
          <div className="text-lg mb-2">Audio Overlay</div>
          <div className="text-sm opacity-70">
            Status: {isPlaying ? 'Playing' : 'Idle'}
          </div>
          {currentFile && (
            <div className="text-xs opacity-50 mt-1">
              File: {currentFile}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Invisible when not in debug mode
  return (
    <div className="w-screen h-screen" style={{ backgroundColor: 'transparent' }} />
  );
}
