'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';
import { usePluginStore } from '@/stores/pluginStore';
import { renderIcon } from '@/lib/icons';
import { PluginManifest, PluginCategory } from '@/lib/types';

const EXPANDED_CATEGORIES_KEY = 'aituberflow-sidebar-expanded';

// Node type definition for drag-and-drop
export interface SidebarNodeType {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  defaultConfig: Record<string, unknown>;
}

interface SidebarProps {
  isRunning: boolean;
  onToggleRun: () => void;
  onSave?: () => void;
  onExport?: () => void;
  onImport?: () => void;
}

// Category display colors
const CATEGORY_COLORS: Record<PluginCategory, string> = {
  control: '#F59E0B',
  input: '#22C55E',
  llm: '#10B981',
  tts: '#F59E0B',
  avatar: '#E879F9',
  output: '#A855F7',
  utility: '#6366F1',
  obs: '#302E31',
};

// Category labels
const CATEGORY_LABELS: Record<PluginCategory, string> = {
  control: 'Control Flow',
  input: 'Input',
  llm: 'LLM',
  tts: 'TTS',
  avatar: 'Avatar',
  output: 'Output',
  utility: 'Utility',
  obs: 'OBS',
};

// Category order
const CATEGORY_ORDER: PluginCategory[] = [
  'control',
  'input',
  'llm',
  'tts',
  'avatar',
  'output',
  'utility',
  'obs',
];

// Convert plugin to SidebarNodeType
function pluginToNodeType(plugin: PluginManifest): SidebarNodeType {
  const defaultConfig: Record<string, unknown> = {};
  if (plugin.config) {
    for (const [key, field] of Object.entries(plugin.config)) {
      if ('default' in field) {
        defaultConfig[key] = field.default;
      }
    }
  }

  return {
    id: plugin.id,
    label: plugin.ui?.label ?? plugin.name,
    color: plugin.ui?.color ?? '#6B7280',
    bgColor: plugin.ui?.bgColor ?? 'rgba(107, 114, 128, 0.1)',
    icon: renderIcon(plugin.ui?.icon ?? 'Box', { color: plugin.ui?.color ?? '#6B7280' }),
    defaultConfig,
  };
}

// Export for use in Canvas (backward compatibility)
export function getNodeTypes(): SidebarNodeType[] {
  const { plugins } = usePluginStore.getState();
  return plugins.map(pluginToNodeType);
}

export default function Sidebar({ isRunning, onToggleRun, onSave, onExport, onImport }: SidebarProps) {
  const { addNode } = useWorkflowStore();
  const { plugins, categories, isLoading, fetchPlugins } = usePluginStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isHydrated, setIsHydrated] = useState(false);

  // Fetch plugins on mount
  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  // Load expanded state from localStorage after mount
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

  // Save to localStorage when expanded categories change
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(EXPANDED_CATEGORIES_KEY, JSON.stringify([...expandedCategories]));
    }
  }, [expandedCategories, isHydrated]);

  // Group plugins by category
  const pluginsByCategory = useMemo(() => {
    const grouped: Record<string, PluginManifest[]> = {};
    for (const plugin of plugins) {
      const category = plugin.category;
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(plugin);
    }
    return grouped;
  }, [plugins]);

  // Filter by search query
  const filteredCategories = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return CATEGORY_ORDER
      .filter((catId) => pluginsByCategory[catId]?.length > 0)
      .map((catId) => {
        const categoryPlugins = pluginsByCategory[catId] || [];
        const filteredPlugins = query
          ? categoryPlugins.filter(
              (p) =>
                (p.ui?.label ?? p.name).toLowerCase().includes(query) ||
                p.id.toLowerCase().includes(query)
            )
          : categoryPlugins;

        return {
          id: catId,
          label: CATEGORY_LABELS[catId] || catId,
          color: CATEGORY_COLORS[catId] || '#6B7280',
          plugins: filteredPlugins,
        };
      })
      .filter((cat) => cat.plugins.length > 0);
  }, [pluginsByCategory, searchQuery]);

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

  const handleDragStart = (e: React.DragEvent, plugin: PluginManifest) => {
    const nodeType = pluginToNodeType(plugin);
    e.dataTransfer.setData('application/json', JSON.stringify({
      nodeType: nodeType.id,
      defaultConfig: nodeType.defaultConfig,
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleClick = (plugin: PluginManifest) => {
    const nodeType = pluginToNodeType(plugin);
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

      {/* Node List */}
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
          {isLoading ? (
            <div className="text-center py-4 text-white/40 text-xs">
              Loading plugins...
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-4 text-white/40 text-xs">
              No nodes found
            </div>
          ) : (
            filteredCategories.map((category) => (
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

                {/* Category Nodes */}
                {(searchQuery.trim() || expandedCategories.has(category.id)) && (
                  <div className="p-2 grid grid-cols-2 gap-1.5">
                    {category.plugins.map((plugin) => {
                      const color = plugin.ui?.color ?? '#6B7280';
                      const bgColor = plugin.ui?.bgColor ?? 'rgba(107, 114, 128, 0.1)';
                      const iconName = plugin.ui?.icon ?? 'Box';
                      const label = plugin.ui?.label ?? plugin.name;

                      return (
                        <button
                          key={plugin.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, plugin)}
                          onClick={() => handleClick(plugin)}
                          className="p-2 rounded cursor-grab active:cursor-grabbing flex items-center gap-1.5 text-xs text-white transition-all hover:opacity-80 hover:scale-105"
                          style={{
                            background: bgColor,
                            border: `1px solid ${color}40`,
                          }}
                        >
                          <span style={{ color }}>{renderIcon(iconName, { color })}</span>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
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

// Export nodeTypes for backward compatibility
export const nodeTypes: SidebarNodeType[] = [];
