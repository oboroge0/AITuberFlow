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

// Note: VTubeStudioBridge is no longer used here.
// VTube Studio is now controlled directly by the backend.

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
  vtubeMouthParam?: string; // VTube Studio mouth parameter ID
  vtubeExpressionMap?: Record<string, string>; // Expression to VTS hotkey mapping
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

// VTube Studio uses the dynamically imported VTubeStudioBridge component

export default function AvatarView({
  renderer,
  modelUrl,
  animationUrl,
  pngConfig,
  vtubePort = 8001,
  vtubeMouthParam,
  vtubeExpressionMap,
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
        // VTube Studio is controlled by the backend, not the frontend
        return (
          <div className="vtube-studio-placeholder flex flex-col items-center justify-center h-full text-white/50">
            <div className="text-4xl mb-4">🎭</div>
            <div className="text-sm mb-2">VTube Studio</div>
            <div className="text-xs text-green-400">Backend Connected</div>
            <div className="mt-4 text-xs text-white/30 text-center max-w-xs">
              Avatar is rendered in VTube Studio.
              <br />
              Lip sync and expressions are sent from the server.
            </div>
          </div>
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
  }, [renderer, modelUrl, animationUrl, pngConfig, vtubePort, vtubeMouthParam, vtubeExpressionMap, state, backgroundColor, enableControls, showGrid, onMotionComplete]);

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
