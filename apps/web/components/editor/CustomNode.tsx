'use client';

import React, { memo } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';
import { useWorkflowStore } from '@/stores/workflowStore';

export interface CustomNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  category: 'input' | 'process' | 'output' | 'control';
  config: Record<string, unknown>;
  inputs?: { id: string; label: string }[];
  outputs?: { id: string; label: string }[];
  isReachable?: boolean;  // Whether this node is reachable from Start
  isEntryPoint?: boolean; // Whether this node can start execution (no inputs)
  onPlayClick?: () => void; // Callback when play button is clicked
}

export type CustomNodeType = Node<CustomNodeData>;

// Node type configurations with colors and icons
const nodeTypeConfig: Record<string, { color: string; bgColor: string; icon: React.ReactNode; statusText: string }> = {
  'start': {
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/>
      </svg>
    ),
    statusText: 'Workflow entry point',
  },
  'end': {
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>
      </svg>
    ),
    statusText: 'Workflow exit point',
  },
  'loop': {
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
    ),
    statusText: 'Loop iteration',
  },
  'foreach': {
    color: '#F97316',
    bgColor: 'rgba(249, 115, 22, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
    statusText: 'ForEach iteration',
  },
  'youtube-chat': {
    color: '#FF0000',
    bgColor: 'rgba(255, 0, 0, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    statusText: 'Waiting for comments...',
  },
  'twitch-chat': {
    color: '#9146FF',
    bgColor: 'rgba(145, 70, 255, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    statusText: 'Waiting for chat...',
  },
  'manual-input': {
    color: '#22C55E',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/>
        <line x1="12" y1="4" x2="12" y2="20"/>
      </svg>
    ),
    statusText: 'Ready for input',
  },
  'openai-llm': {
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
        <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
        <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
        <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
        <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
      </svg>
    ),
    statusText: 'Model: gpt-4o-mini',
  },
  'voicevox-tts': {
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    ),
    statusText: 'Engine: VOICEVOX',
  },
  'console-output': {
    color: '#A855F7',
    bgColor: 'rgba(168, 85, 247, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    statusText: 'Ready to display',
  },
  'switch': {
    color: '#F97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
        <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
        <line x1="4" y1="4" x2="9" y2="9"/>
      </svg>
    ),
    statusText: 'Conditional routing',
  },
  'delay': {
    color: '#F97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    statusText: 'Delay: 1000ms',
  },
  'http-request': {
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    statusText: 'HTTP Request',
  },
  'text-transform': {
    color: '#EC4899',
    bgColor: 'rgba(236, 72, 153, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/>
        <line x1="12" y1="4" x2="12" y2="20"/>
      </svg>
    ),
    statusText: 'Text Transform',
  },
  'random': {
    color: '#8B5CF6',
    bgColor: 'rgba(139, 92, 246, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/>
        <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
      </svg>
    ),
    statusText: 'Random Generator',
  },
  'timer': {
    color: '#06B6D4',
    bgColor: 'rgba(6, 182, 212, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    statusText: 'Timer',
  },
  'variable': {
    color: '#14B8A6',
    bgColor: 'rgba(20, 184, 166, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7h6M14 7h6M8 17h8"/>
        <path d="M7 3l-4 4 4 4M17 13l4 4-4 4"/>
      </svg>
    ),
    statusText: 'Variable',
  },
  'anthropic-llm': {
    color: '#D97706',
    bgColor: 'rgba(217, 119, 6, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
        <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
        <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      </svg>
    ),
    statusText: 'Model: Claude',
  },
  'google-llm': {
    color: '#4285F4',
    bgColor: 'rgba(66, 133, 244, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
        <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
        <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      </svg>
    ),
    statusText: 'Model: Gemini',
  },
  'ollama-llm': {
    color: '#1F2937',
    bgColor: 'rgba(31, 41, 55, 0.3)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
        <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
        <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      </svg>
    ),
    statusText: 'Model: Ollama',
  },
  'coeiroink-tts': {
    color: '#E91E63',
    bgColor: 'rgba(233, 30, 99, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    ),
    statusText: 'Engine: COEIROINK',
  },
  'sbv2-tts': {
    color: '#9C27B0',
    bgColor: 'rgba(156, 39, 176, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    ),
    statusText: 'Engine: Style-Bert-VITS2',
  },
  'avatar-display': {
    color: '#E879F9',
    bgColor: 'rgba(232, 121, 249, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/>
      </svg>
    ),
    statusText: 'Avatar Display',
  },
  'emotion-analyzer': {
    color: '#F472B6',
    bgColor: 'rgba(244, 114, 182, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
    ),
    statusText: 'Emotion Analyzer',
  },
  'lip-sync': {
    color: '#FB7185',
    bgColor: 'rgba(251, 113, 133, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 18c-4 0-6-2-6-2s2-2 6-2 6 2 6 2-2 2-6 2z"/>
        <circle cx="12" cy="12" r="10"/>
      </svg>
    ),
    statusText: 'Lip Sync',
  },
};

// Default config for unknown node types
const defaultNodeConfig = {
  color: '#6B7280',
  bgColor: 'rgba(107, 114, 128, 0.1)',
  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>
  ),
  statusText: 'Ready',
};

interface CustomNodeProps {
  id: string;
  data: CustomNodeData;
  selected?: boolean;
}

function CustomNode({ id, data, selected }: CustomNodeProps) {
  const { nodeStatuses, selectNode } = useWorkflowStore();
  const status = nodeStatuses[id];
  const config = nodeTypeConfig[data.type] || defaultNodeConfig;

  // Check if node is an entry point
  const isEntryPoint = data.isEntryPoint === true;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(id);
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onPlayClick) {
      data.onPlayClick();
    }
  };

  // Get status text based on running state
  const getStatusText = () => {
    if (status?.status === 'running') return 'Processing...';
    if (status?.status === 'error') return 'Error occurred';
    if (status?.status === 'completed') return 'Completed';

    // Show config-based status
    if (data.type === 'openai-llm' && data.config?.model) {
      return `Model: ${data.config.model}`;
    }
    if (data.type === 'voicevox-tts' && data.config?.speaker) {
      return `Speaker: ${data.config.speaker}`;
    }
    if (data.type === 'delay' && data.config?.delayMs) {
      return `Delay: ${data.config.delayMs}ms`;
    }
    return config.statusText;
  };

  return (
    <div
      onClick={handleClick}
      className="relative"
      style={{
        background: config.bgColor,
        border: `2px solid ${selected ? config.color : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '12px',
        padding: '12px 16px',
        minWidth: '160px',
        boxShadow: selected
          ? `0 0 20px ${config.color}40, 0 4px 20px rgba(0,0,0,0.3)`
          : '0 4px 20px rgba(0,0,0,0.2)',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
    >
      {/* Play button for entry-point nodes */}
      {isEntryPoint && (
        <button
          onClick={handlePlayClick}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110 z-10"
          style={{
            background: 'linear-gradient(135deg, #10B981, #059669)',
            border: '2px solid #1F2937',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
          }}
          title="Run from this node"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="none">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>
      )}
      {/* Input handles */}
      {data.inputs && data.inputs.length > 0 && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2">
          {data.inputs.map((input, idx) => (
            <Handle
              key={input.id}
              type="target"
              position={Position.Left}
              id={input.id}
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#374151',
                border: '2px solid #1F2937',
                position: 'relative',
                top: 'auto',
                transform: 'none',
                marginTop: idx > 0 ? '8px' : '0',
              }}
            />
          ))}
        </div>
      )}

      {/* Output handles */}
      {data.outputs && data.outputs.length > 0 && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2">
          {data.outputs.map((output, idx) => (
            <Handle
              key={output.id}
              type="source"
              position={Position.Right}
              id={output.id}
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: config.color,
                border: '2px solid #1F2937',
                position: 'relative',
                top: 'auto',
                transform: 'none',
                marginTop: idx > 0 ? '8px' : '0',
              }}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: config.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          {config.icon}
        </div>
        <span className="font-semibold text-[13px] text-white">
          {data.label}
        </span>
      </div>

      {/* Status */}
      <div className="text-[11px] text-white/50">
        {getStatusText()}
      </div>

      {/* Running indicator */}
      {status?.status === 'running' && (
        <div className="absolute -top-1 -right-1">
          <span className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse block" />
        </div>
      )}
      {status?.status === 'completed' && (
        <div className="absolute -top-1 -right-1">
          <span className="w-3 h-3 rounded-full bg-green-400 block" />
        </div>
      )}
      {status?.status === 'error' && (
        <div className="absolute -top-1 -right-1">
          <span className="w-3 h-3 rounded-full bg-red-400 block" />
        </div>
      )}
    </div>
  );
}

export default memo(CustomNode);
