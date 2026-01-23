'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';

const EXPANDED_CATEGORIES_KEY = 'aituberflow-sidebar-expanded';

// Node type definition
export interface SidebarNodeType {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  defaultConfig: Record<string, unknown>;
}

interface NodeCategory {
  id: string;
  label: string;
  color: string;
  nodes: SidebarNodeType[];
}

// Node categories with their nodes
const nodeCategories: NodeCategory[] = [
  {
    id: 'control',
    label: 'Control Flow',
    color: '#F59E0B',
    nodes: [
      {
        id: 'start',
        label: 'Start',
        color: '#10B981',
        bgColor: 'rgba(16, 185, 129, 0.15)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/>
          </svg>
        ),
        defaultConfig: { autoStart: true },
      },
      {
        id: 'end',
        label: 'End',
        color: '#EF4444',
        bgColor: 'rgba(239, 68, 68, 0.15)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>
          </svg>
        ),
        defaultConfig: { message: 'Workflow completed' },
      },
      {
        id: 'loop',
        label: 'Loop',
        color: '#F59E0B',
        bgColor: 'rgba(245, 158, 11, 0.15)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        ),
        defaultConfig: { mode: 'count', count: 3, condition: '', maxIterations: 100 },
      },
      {
        id: 'foreach',
        label: 'ForEach',
        color: '#F97316',
        bgColor: 'rgba(249, 115, 22, 0.15)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        ),
        defaultConfig: { separator: '\n' },
      },
      {
        id: 'switch',
        label: 'Switch',
        color: '#EAB308',
        bgColor: 'rgba(234, 179, 8, 0.15)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
            <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
            <line x1="4" y1="4" x2="9" y2="9"/>
          </svg>
        ),
        defaultConfig: { conditions: [] },
      },
      {
        id: 'delay',
        label: 'Delay',
        color: '#64748B',
        bgColor: 'rgba(100, 116, 139, 0.15)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        ),
        defaultConfig: { delayMs: 1000 },
      },
    ],
  },
  {
    id: 'input',
    label: 'Input Sources',
    color: '#22C55E',
    nodes: [
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
        id: 'discord-chat',
        label: 'Discord',
        color: '#5865F2',
        bgColor: 'rgba(88, 101, 242, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        ),
        defaultConfig: { botToken: '', channelIds: '', filterBots: true, mentionOnly: false },
      },
      {
        id: 'timer',
        label: 'Timer',
        color: '#06B6D4',
        bgColor: 'rgba(6, 182, 212, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        ),
        defaultConfig: { intervalMs: 5000, maxTicks: 0, immediate: true },
      },
    ],
  },
  {
    id: 'llm',
    label: 'LLM',
    color: '#10B981',
    nodes: [
      {
        id: 'openai-llm',
        label: 'ChatGPT',
        color: '#10B981',
        bgColor: 'rgba(16, 185, 129, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
            <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
          </svg>
        ),
        defaultConfig: { model: 'gpt-4o-mini', systemPrompt: '', temperature: 0.7 },
      },
      {
        id: 'anthropic-llm',
        label: 'Claude',
        color: '#D97706',
        bgColor: 'rgba(217, 119, 6, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
            <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
          </svg>
        ),
        defaultConfig: { model: 'claude-3-haiku-20240307', systemPrompt: '', maxTokens: 1024, temperature: 0.7 },
      },
      {
        id: 'google-llm',
        label: 'Gemini',
        color: '#4285F4',
        bgColor: 'rgba(66, 133, 244, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
            <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
          </svg>
        ),
        defaultConfig: { model: 'gemini-1.5-flash', systemPrompt: '', maxTokens: 1024, temperature: 0.7 },
      },
      {
        id: 'ollama-llm',
        label: 'Ollama',
        color: '#1F2937',
        bgColor: 'rgba(31, 41, 55, 0.3)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
            <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
          </svg>
        ),
        defaultConfig: { host: 'http://localhost:11434', model: 'llama3.2', systemPrompt: '', temperature: 0.7 },
      },
    ],
  },
  {
    id: 'tts',
    label: 'TTS',
    color: '#F59E0B',
    nodes: [
      {
        id: 'voicevox-tts',
        label: 'VOICEVOX',
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
        id: 'coeiroink-tts',
        label: 'COEIROINK',
        color: '#E91E63',
        bgColor: 'rgba(233, 30, 99, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        ),
        defaultConfig: { host: 'http://localhost:50032', speakerUuid: '', styleId: 0, speedScale: 1.0 },
      },
      {
        id: 'sbv2-tts',
        label: 'SBV2',
        color: '#9C27B0',
        bgColor: 'rgba(156, 39, 176, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        ),
        defaultConfig: { host: 'http://localhost:5000', modelName: '', speakerId: 0, style: 'Neutral', length: 1.0 },
      },
    ],
  },
  {
    id: 'avatar',
    label: 'Avatar',
    color: '#E879F9',
    nodes: [
      {
        id: 'avatar-configuration',
        label: 'Avatar',
        color: '#E879F9',
        bgColor: 'rgba(232, 121, 249, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/>
          </svg>
        ),
        defaultConfig: {
          renderer: 'vrm',
          model_url: '',
          idle_animation: '',
        },
      },
      {
        id: 'emotion-analyzer',
        label: 'Emotion',
        color: '#F472B6',
        bgColor: 'rgba(244, 114, 182, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        ),
        defaultConfig: { method: 'rule-based', language: 'ja', emit_events: true },
      },
      {
        id: 'motion-trigger',
        label: 'Motion',
        color: '#C084FC',
        bgColor: 'rgba(192, 132, 252, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        ),
        defaultConfig: { expression: '', intensity: 0.8, motion_url: '', motion: '', emit_events: true },
      },
      {
        id: 'lip-sync',
        label: 'LipSync',
        color: '#FB7185',
        bgColor: 'rgba(251, 113, 133, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 18c-4 0-6-2-6-2s2-2 6-2 6 2 6 2-2 2-6 2z"/>
            <circle cx="12" cy="12" r="10"/>
          </svg>
        ),
        defaultConfig: { method: 'volume', sensitivity: 5.0, smoothing: 0.3, threshold: 0.02, emit_realtime: true },
      },
    ],
  },
  {
    id: 'output',
    label: 'Output',
    color: '#A855F7',
    nodes: [
      {
        id: 'subtitle-display',
        label: 'Subtitle',
        color: '#A855F7',
        bgColor: 'rgba(168, 85, 247, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <line x1="6" y1="14" x2="18" y2="14"/>
            <line x1="6" y1="18" x2="14" y2="18"/>
          </svg>
        ),
        defaultConfig: {
          style: 'default',
          position: 'bottom-center',
          font_size: 24,
          font_color: '#ffffff',
          background_color: 'rgba(0, 0, 0, 0.7)',
          animation: 'fade',
        },
      },
      {
        id: 'audio-player',
        label: 'Audio',
        color: '#8B5CF6',
        bgColor: 'rgba(139, 92, 246, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        ),
        defaultConfig: { wait_for_completion: true, volume: 1.0, output_device: 'browser' },
      },
      {
        id: 'donation-alert',
        label: 'Donation',
        color: '#F59E0B',
        bgColor: 'rgba(245, 158, 11, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        ),
        defaultConfig: { alertSound: '', displayDuration: 5000, minAmount: 0, template: '{author} donated {amount} {currency}!', style: 'default' },
      },
      {
        id: 'console-output',
        label: 'Console',
        color: '#64748B',
        bgColor: 'rgba(100, 116, 139, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
        ),
        defaultConfig: { prefix: '[Output]' },
      },
    ],
  },
  {
    id: 'utility',
    label: 'Utility',
    color: '#3B82F6',
    nodes: [
      {
        id: 'text-transform',
        label: 'Text',
        color: '#EC4899',
        bgColor: 'rgba(236, 72, 153, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/>
            <line x1="12" y1="4" x2="12" y2="20"/>
          </svg>
        ),
        defaultConfig: { operation: 'template', template: '{{text}}', find: '', replaceWith: '', delimiter: ' ' },
      },
      {
        id: 'variable',
        label: 'Variable',
        color: '#14B8A6',
        bgColor: 'rgba(20, 184, 166, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h6M14 7h6M8 17h8"/>
            <path d="M7 3l-4 4 4 4M17 13l4 4-4 4"/>
          </svg>
        ),
        defaultConfig: { name: 'myVariable', defaultValue: '', valueType: 'string' },
      },
      {
        id: 'http-request',
        label: 'HTTP',
        color: '#3B82F6',
        bgColor: 'rgba(59, 130, 246, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        ),
        defaultConfig: { url: '', method: 'GET', headers: '{}', timeout: 30000 },
      },
      {
        id: 'random',
        label: 'Random',
        color: '#8B5CF6',
        bgColor: 'rgba(139, 92, 246, 0.1)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
          </svg>
        ),
        defaultConfig: { mode: 'number', min: 0, max: 100, choices: 'option1,option2,option3', trueProbability: 50 },
      },
    ],
  },
  {
    id: 'obs',
    label: 'OBS',
    color: '#302E31',
    nodes: [
      {
        id: 'obs-scene-switch',
        label: 'Scene',
        color: '#302E31',
        bgColor: 'rgba(48, 46, 49, 0.3)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        ),
        defaultConfig: { host: 'localhost', port: 4455, password: '', scene_name: '' },
      },
      {
        id: 'obs-source-toggle',
        label: 'Source',
        color: '#302E31',
        bgColor: 'rgba(48, 46, 49, 0.3)',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        ),
        defaultConfig: { host: 'localhost', port: 4455, password: '', scene_name: '', source_name: '', action: 'toggle' },
      },
    ],
  },
];

// Flatten for exports
const nodeTypes: SidebarNodeType[] = nodeCategories.flatMap((cat) => cat.nodes);

// Export for use in Canvas
export { nodeTypes, type SidebarNodeType };

interface SidebarProps {
  isRunning: boolean;
  onToggleRun: () => void;
  onSave?: () => void;
  onExport?: () => void;
  onImport?: () => void;
}

export default function Sidebar({ isRunning, onToggleRun, onSave, onExport, onImport }: SidebarProps) {
  const { addNode } = useWorkflowStore();
  const [searchQuery, setSearchQuery] = useState('');

  // Start with empty set to avoid hydration mismatch
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage after mount (client-side only)
  useEffect(() => {
    const saved = localStorage.getItem(EXPANDED_CATEGORIES_KEY);
    if (saved) {
      try {
        setExpandedCategories(new Set(JSON.parse(saved)));
      } catch {
        // ignore parse errors
      }
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage when expanded categories change (only after hydration)
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(EXPANDED_CATEGORIES_KEY, JSON.stringify([...expandedCategories]));
    }
  }, [expandedCategories, isHydrated]);

  // Filter categories and nodes based on search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return nodeCategories;

    const query = searchQuery.toLowerCase();
    return nodeCategories
      .map((category) => ({
        ...category,
        nodes: category.nodes.filter(
          (node) =>
            node.label.toLowerCase().includes(query) ||
            node.id.toLowerCase().includes(query)
        ),
      }))
      .filter((category) => category.nodes.length > 0);
  }, [searchQuery]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

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
      className="w-[260px] h-full flex flex-col overflow-hidden"
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

      {/* Add Node - Categorized (Scrollable) */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="px-4 pt-4 pb-2 space-y-2">
          <h3 className="text-xs text-white/50 uppercase tracking-wider m-0">
            Nodes (Drag to Canvas)
          </h3>
          {/* Search Input */}
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-md text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {filteredCategories.length === 0 ? (
            <div className="text-center py-4 text-white/40 text-xs">
              No nodes found
            </div>
          ) : filteredCategories.map((category) => (
            <div key={category.id} className="border border-white/10 rounded-lg overflow-hidden">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full px-3 py-2 flex items-center justify-between text-left bg-white/5 hover:bg-white/10 transition-colors"
              >
                <span className="text-xs font-medium" style={{ color: category.color }}>
                  {category.label}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`text-white/50 transition-transform ${
                    expandedCategories.has(category.id) ? 'rotate-180' : ''
                  }`}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {/* Category Nodes - auto-expand when searching */}
              {(searchQuery.trim() || expandedCategories.has(category.id)) && (
                <div className="p-2 grid grid-cols-2 gap-1.5">
                  {category.nodes.map((nodeType) => (
                    <button
                      key={nodeType.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, nodeType)}
                      onClick={() => handleClick(nodeType)}
                      className="p-2 rounded cursor-grab active:cursor-grabbing flex items-center gap-1.5 text-xs text-white transition-all hover:opacity-80 hover:scale-105"
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
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-white/10 space-y-2">
        <button
          onClick={onSave}
          className="w-full py-2 rounded-md border border-white/20 bg-transparent text-white/70 text-xs cursor-pointer flex items-center justify-center gap-1 transition-colors hover:bg-white/5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>
          Save
        </button>
        <div className="flex gap-2">
          <button
            onClick={onExport}
            className="flex-1 py-2 rounded-md border border-white/20 bg-transparent text-white/70 text-xs cursor-pointer flex items-center justify-center gap-1 transition-colors hover:bg-white/5"
            title="Export workflow as JSON"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>
          <button
            onClick={onImport}
            className="flex-1 py-2 rounded-md border border-white/20 bg-transparent text-white/70 text-xs cursor-pointer flex items-center justify-center gap-1 transition-colors hover:bg-white/5"
            title="Import workflow from JSON"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
