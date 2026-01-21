'use client';

import React, { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import VRMRenderer to avoid SSR issues with Three.js
const VRMRenderer = dynamic(() => import('./VRMRenderer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-black/50">
      <div className="text-white text-sm">Loading renderer...</div>
    </div>
  ),
});

export type RendererType = 'vrm' | 'vtube-studio' | 'png';

export interface AvatarState {
  expression: string;
  mouthOpen: number;
  motion?: string;
  lookAt?: { x: number; y: number };
}

export interface AvatarViewProps {
  renderer: RendererType;
  modelUrl?: string;
  animationUrl?: string; // URL to Mixamo FBX animation (idle/loop)
  pngConfig?: PNGAvatarConfig;
  vtubePort?: number;
  state: AvatarState;
  className?: string;
  showSubtitles?: boolean;
  subtitleText?: string;
  backgroundColor?: string;
  enableControls?: boolean;
  showGrid?: boolean;
  onMotionComplete?: () => void; // Called when one-shot motion finishes
}

export interface PNGAvatarConfig {
  baseUrl: string;
  expressions: Record<string, string>; // expression name -> image path
  defaultExpression: string;
}

// PNG Avatar Renderer Component
function PNGRenderer({
  config,
  expression,
  className = '',
}: {
  config: PNGAvatarConfig;
  expression: string;
  className?: string;
}) {
  const [currentImage, setCurrentImage] = useState(config.baseUrl);

  useEffect(() => {
    const imagePath = config.expressions[expression] || config.expressions[config.defaultExpression] || config.baseUrl;
    setCurrentImage(imagePath);
  }, [expression, config]);

  return (
    <div className={`png-renderer flex items-center justify-center h-full ${className}`}>
      <img
        src={currentImage}
        alt="Avatar"
        className="max-w-full max-h-full object-contain transition-opacity duration-200"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  );
}

// VTube Studio Connector Placeholder
function VTubeStudioRenderer({
  port,
  state,
  className = '',
}: {
  port: number;
  state: AvatarState;
  className?: string;
}) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Connecting...');

  useEffect(() => {
    // VTube Studio connection would be implemented here
    // For now, show a placeholder
    setStatus(`VTube Studio on port ${port}`);

    // TODO: Implement actual VTube Studio API connection
    // const ws = new WebSocket(`ws://localhost:${port}`);

    return () => {
      // Cleanup WebSocket connection
    };
  }, [port]);

  return (
    <div className={`vtube-studio-renderer flex flex-col items-center justify-center h-full ${className}`}>
      <div className="text-white/50 text-center">
        <div className="text-4xl mb-4">🎭</div>
        <div className="text-sm mb-2">{status}</div>
        <div className="text-xs text-white/30">
          {connected ? 'Connected' : 'VTube Studio integration'}
        </div>
        <div className="mt-4 text-xs text-white/50">
          <div>Expression: {state.expression}</div>
          <div>Mouth: {(state.mouthOpen * 100).toFixed(0)}%</div>
        </div>
      </div>
    </div>
  );
}

export default function AvatarView({
  renderer,
  modelUrl,
  animationUrl,
  pngConfig,
  vtubePort = 8001,
  state,
  className = '',
  showSubtitles = false,
  subtitleText = '',
  backgroundColor = 'transparent',
  enableControls = false,
  showGrid = false,
  onMotionComplete,
}: AvatarViewProps) {
  const renderAvatar = useCallback(() => {
    switch (renderer) {
      case 'vrm':
        if (!modelUrl) {
          return (
            <div className="flex items-center justify-center h-full text-white/50">
              No VRM model specified
            </div>
          );
        }
        return (
          <VRMRenderer
            modelUrl={modelUrl}
            animationUrl={animationUrl}
            motionUrl={state.motion}
            expression={state.expression}
            mouthOpen={state.mouthOpen}
            lookAt={state.lookAt}
            backgroundColor={backgroundColor}
            enableControls={enableControls}
            showGrid={showGrid}
            idleAnimation={true}
            onMotionComplete={onMotionComplete}
          />
        );

      case 'vtube-studio':
        return (
          <VTubeStudioRenderer
            port={vtubePort}
            state={state}
          />
        );

      case 'png':
        if (!pngConfig) {
          return (
            <div className="flex items-center justify-center h-full text-white/50">
              No PNG config specified
            </div>
          );
        }
        return (
          <PNGRenderer
            config={pngConfig}
            expression={state.expression}
          />
        );

      default:
        return (
          <div className="flex items-center justify-center h-full text-white/50">
            Unknown renderer: {renderer}
          </div>
        );
    }
  }, [renderer, modelUrl, animationUrl, pngConfig, vtubePort, state, backgroundColor, enableControls, showGrid, onMotionComplete]);

  return (
    <div className={`avatar-view relative w-full h-full ${className}`} style={{ pointerEvents: 'auto' }}>
      {/* Avatar Renderer */}
      <div className="absolute inset-0" style={{ pointerEvents: 'auto' }}>
        {renderAvatar()}
      </div>

      {/* Subtitles */}
      {showSubtitles && subtitleText && (
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-3 text-center">
            <p className="text-white text-lg leading-relaxed">
              {subtitleText}
            </p>
          </div>
        </div>
      )}

      {/* Debug Info (can be toggled) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm rounded px-2 py-1 text-xs text-white/70 pointer-events-none">
          <div>Renderer: {renderer}</div>
          <div>Expression: {state.expression}</div>
          <div>Mouth: {(state.mouthOpen * 100).toFixed(0)}%</div>
        </div>
      )}
    </div>
  );
}
