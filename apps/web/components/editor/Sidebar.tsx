'use client';

import React from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';

// Node type definitions with icons
const nodeTypes = [
  {
    id: 'youtube-chat',
    label: 'YouTube',
    color: '#FF0000',
    bgColor: 'rgba(255, 0, 0, 0.1)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    defaultConfig: { videoId: '', apiKey: '', pollInterval: 3000 },
  },
  {
    id: 'twitch-chat',
    label: 'Twitch',
    color: '#9146FF',
    bgColor: 'rgba(145, 70, 255, 0.1)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    defaultConfig: { channel: '' },
  },
  {
    id: 'openai-llm',
    label: 'LLM',
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
        <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
        <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      </svg>
    ),
    defaultConfig: { model: 'gpt-4o-mini', systemPrompt: '', temperature: 0.7 },
  },
  {
    id: 'voicevox-tts',
    label: 'TTS',
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    ),
    defaultConfig: { host: 'http://localhost:50021', speaker: 1, speedScale: 1.0 },
  },
  {
    id: 'manual-input',
    label: 'Input',
    color: '#22C55E',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/>
        <line x1="12" y1="4" x2="12" y2="20"/>
      </svg>
    ),
    defaultConfig: { placeholder: 'Enter text...' },
  },
  {
    id: 'console-output',
    label: 'Console',
    color: '#A855F7',
    bgColor: 'rgba(168, 85, 247, 0.1)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    defaultConfig: { prefix: '[Output]' },
  },
];

// Export for use in Canvas
export { nodeTypes };

interface SidebarProps {
  isRunning: boolean;
  onToggleRun: () => void;
  onSave?: () => void;
  onLoad?: () => void;
}

export default function Sidebar({ isRunning, onToggleRun, onSave, onLoad }: SidebarProps) {
  const { addNode } = useWorkflowStore();

  const handleDragStart = (e: React.DragEvent, nodeType: typeof nodeTypes[0]) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      nodeType: nodeType.id,
      defaultConfig: nodeType.defaultConfig,
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleClick = (nodeType: typeof nodeTypes[0]) => {
    // Fallback: click to add node at random position
    addNode({
      type: nodeType.id,
      position: { x: 200 + Math.random() * 200, y: 150 + Math.random() * 200 },
      config: { ...nodeType.defaultConfig },
    });
  };

  return (
    <div
      className="w-[280px] h-full flex flex-col overflow-hidden"
      style={{
        background: 'rgba(17, 24, 39, 0.95)',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <h2
          className="text-lg font-bold m-0"
          style={{
            background: 'linear-gradient(135deg, #10B981, #3B82F6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          AITuber Flow
        </h2>
        <p className="text-xs text-white/50 mt-1 m-0">
          Visual Workflow Editor
        </p>
      </div>

      {/* Run Control */}
      <div className="p-4 border-b border-white/10">
        <button
          onClick={onToggleRun}
          className="w-full py-3 rounded-lg border-none text-white font-semibold text-sm cursor-pointer flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
          style={{
            background: isRunning
              ? 'linear-gradient(135deg, #EF4444, #DC2626)'
              : 'linear-gradient(135deg, #10B981, #059669)',
          }}
        >
          {isRunning ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
              </svg>
              Stop Workflow
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Run Workflow
            </>
          )}
        </button>
      </div>

      {/* Add Node - Draggable */}
      <div className="p-4 border-b border-white/10">
        <h3 className="text-xs text-white/50 uppercase tracking-wider mb-3 m-0">
          Add Node (Drag to Canvas)
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {nodeTypes.map((nodeType) => (
            <button
              key={nodeType.id}
              draggable
              onDragStart={(e) => handleDragStart(e, nodeType)}
              onClick={() => handleClick(nodeType)}
              className="p-2.5 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-1.5 text-xs text-white transition-all hover:opacity-80 hover:scale-105"
              style={{
                background: nodeType.bgColor,
                border: `1px solid ${nodeType.color}40`,
              }}
            >
              <span style={{ color: nodeType.color }}>{nodeType.icon}</span>
              {nodeType.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer Actions */}
      <div className="p-4 border-t border-white/10 flex gap-2">
        <button
          onClick={onSave}
          className="flex-1 py-2 rounded-md border border-white/20 bg-transparent text-white/70 text-xs cursor-pointer flex items-center justify-center gap-1 transition-colors hover:bg-white/5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>
          Save
        </button>
        <button
          onClick={onLoad}
          className="flex-1 py-2 rounded-md border border-white/20 bg-transparent text-white/70 text-xs cursor-pointer flex items-center justify-center gap-1 transition-colors hover:bg-white/5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Load
        </button>
      </div>
    </div>
  );
}
