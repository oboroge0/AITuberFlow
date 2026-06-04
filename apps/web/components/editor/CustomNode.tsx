'use client';

import React, { memo, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type Node } from '@xyflow/react';
import { useWorkflowStore } from '@/stores/workflowStore';
import { usePluginStore } from '@/stores/pluginStore';
import { useUIPreferencesStore } from '@/stores/uiPreferencesStore';
import { useLocaleStore } from '@/stores/localeStore';
import { type PortDefinition, PORT_TYPE_COLORS, PORT_TYPE_LABELS, arePortTypesCompatible, type PortType } from '@/lib/portTypes';
import { useDragStateStore } from '@/stores/dragStateStore';
import { renderIcon } from '@/lib/icons';
import { evaluateShowWhen } from '@/lib/configUtils';
import type { ConfigField } from '@/lib/types';

export interface CustomNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  category: 'input' | 'process' | 'output' | 'control';
  config: Record<string, unknown>;
  pluginConfig?: Record<string, import('@/lib/types').ConfigField>;
  inputs?: PortDefinition[];
  outputs?: PortDefinition[];
  isReachable?: boolean;  // Whether this node is reachable from Start
  isEntryPoint?: boolean; // Whether this node can start execution (no inputs)
  onPlayClick?: () => void; // Callback when play button is clicked
  isSearchMatch?: boolean;  // Whether this node matches the current search
  isSearchDimmed?: boolean; // Whether this node should be dimmed (search active but not matching)
  nodeStatus?: { nodeId: string; status: string; data?: Record<string, unknown> };
}

export type CustomNodeType = Node<CustomNodeData>;

// Node visual configuration derived from plugin store
interface NodeVisualConfig {
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  statusText: string;
}

interface CustomNodeProps {
  id: string;
  data: CustomNodeData;
  selected?: boolean;
}

// Default config for unknown node types
const DEFAULT_COLOR = '#6B7280';
const DEFAULT_BG_COLOR = 'rgba(107, 114, 128, 0.1)';
const DEFAULT_ICON = 'Box';
const DEFAULT_STATUS = 'Ready';

// Chevron SVG components
const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const ChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

// Status visual config
const STATUS_BORDER_COLORS: Record<string, { border: string; glow: string }> = {
  running: { border: '#3B82F6', glow: 'rgba(59,130,246,0.3)' },
  completed: { border: '#10B981', glow: 'rgba(16,185,129,0.2)' },
  error: { border: '#EF4444', glow: 'rgba(239,68,68,0.3)' },
  warning: { border: '#F59E0B', glow: 'rgba(245,158,11,0.25)' },
};

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Inline fields component for ComfyUI-style editing directly on nodes
function InlineFields({
  config,
  pluginConfig,
  onConfigChange,
  accentColor,
}: {
  config: Record<string, unknown>;
  pluginConfig: Record<string, ConfigField>;
  onConfigChange: (key: string, value: unknown) => void;
  accentColor: string;
}) {
  const inlineFields = Object.entries(pluginConfig).filter(
    ([, field]) => field.inline && !field.dynamic
  );
  if (inlineFields.length === 0) return null;

  const barBg = 'rgba(255,255,255,0.07)';

  return (
    <div className="flex flex-col gap-[3px] mt-1">
      {inlineFields.map(([key, field]) => {
        if (!evaluateShowWhen(field.showWhen, config)) return null;

        const value = config[key] ?? field.default;

        if (field.type === 'select' && field.options) {
          const options = field.options.map((opt) =>
            typeof opt === 'string' ? { label: opt, value: opt } : opt
          );
          const selectedLabel = options.find(o => String(o.value) === String(value))?.label || String(value);
          return (
            <div key={key} className="nodrag nopan relative" style={{ background: barBg, borderRadius: '4px' }}>
              <div className="flex items-center justify-between px-2 h-[26px]">
                <span className="text-[10px] text-white/45 select-none">{field.label}</span>
                <span className="text-[10px] text-white/75 select-none">{selectedLabel}</span>
              </div>
              <select
                className="nodrag nopan absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={String(value ?? '')}
                onChange={(e) => onConfigChange(key, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              >
                {options.map((opt) => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        if (field.type === 'number') {
          const numValue = typeof value === 'number' ? value : Number(value) || 0;
          const min = field.min ?? 0;
          const max = field.max ?? 100;
          const step = max - min <= 2 ? 0.01 : max - min <= 10 ? 0.1 : 1;
          const pct = Math.max(0, Math.min(100, ((numValue - min) / (max - min)) * 100));
          return (
            <div key={key} className="nodrag nopan relative" style={{ background: barBg, borderRadius: '4px', overflow: 'hidden' }}>
              <div
                className="absolute left-0 top-0 bottom-0 pointer-events-none"
                style={{ width: `${pct}%`, background: `${accentColor}50`, transition: 'width 0.1s' }}
              />
              <div className="relative flex items-center justify-between px-2 h-[26px]">
                <span className="text-[10px] text-white/45 select-none">{field.label}</span>
                <span className="text-[10px] text-white/75 tabular-nums select-none">
                  {numValue % 1 === 0 ? numValue : numValue.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                className="nodrag nopan absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
                min={min}
                max={max}
                step={step}
                value={numValue}
                onChange={(e) => onConfigChange(key, parseFloat(e.target.value))}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          );
        }

        if (field.type === 'boolean') {
          const boolValue = Boolean(value);
          return (
            <div key={key}>
              <button
                className="nodrag nopan w-full relative text-left"
                style={{ background: barBg, borderRadius: '4px', overflow: 'hidden' }}
                onClick={(e) => { e.stopPropagation(); onConfigChange(key, !boolValue); }}
              >
                {boolValue && (
                  <div className="absolute left-0 top-0 bottom-0 w-full pointer-events-none" style={{ background: `${accentColor}20` }} />
                )}
                <div className="relative flex items-center justify-between px-2 h-[26px]">
                  <span className="text-[10px] text-white/45 select-none">{field.label}</span>
                  <div
                    className="relative flex-shrink-0 rounded-full transition-colors"
                    style={{ width: '20px', height: '11px', background: boolValue ? accentColor : 'rgba(255,255,255,0.2)' }}
                  >
                    <span
                      className="absolute top-[1.5px] rounded-full bg-white transition-transform"
                      style={{ width: '8px', height: '8px', transform: boolValue ? 'translateX(10.5px)' : 'translateX(1.5px)' }}
                    />
                  </div>
                </div>
              </button>
            </div>
          );
        }

        if (field.type === 'string') {
          return (
            <div key={key} className="nodrag nopan relative" style={{ background: barBg, borderRadius: '4px' }}>
              <div className="flex items-center px-2 h-[26px] gap-2">
                <span className="text-[10px] text-white/45 flex-shrink-0 select-none">{field.label}</span>
                <input
                  type="text"
                  className="nodrag nopan bg-transparent text-[10px] text-white/75 outline-none text-right flex-1 min-w-0"
                  value={String(value ?? '')}
                  placeholder={field.placeholder}
                  onChange={(e) => onConfigChange(key, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

function CustomNode({ id, data, selected }: CustomNodeProps) {
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const updateNode = useWorkflowStore((s) => s.updateNode);
  const onInlineConfigChange = useCallback((key: string, value: unknown) => {
    updateNode(id, { config: { ...data.config, [key]: value } });
  }, [id, data.config, updateNode]);
  const status = data.nodeStatus;
  const { getPluginColor, getPluginBgColor, getPluginIcon, getPluginById } = usePluginStore();
  const { nodeDisplayMode, collapsedNodeIds, toggleNodeCollapse } = useUIPreferencesStore();
  const { getNodeDesc } = useLocaleStore();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Popover state
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [popoverPinned, setPopoverPinned] = useState(false);
  const popoverHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Track drag state for port highlight/dim
  const { draggingSourceType } = useDragStateStore();
  // Hover state for port tooltips
  const [hoveredPort, setHoveredPort] = useState<{ id: string; label: string; type: PortType; description?: string; side: 'input' | 'output' } | null>(null);

  const collapsed = collapsedNodeIds.includes(id);

  // Get visual config from plugin store (with fallbacks)
  const plugin = getPluginById(data.type);
  const config: NodeVisualConfig = {
    color: getPluginColor(data.type) || DEFAULT_COLOR,
    bgColor: getPluginBgColor(data.type) || DEFAULT_BG_COLOR,
    icon: renderIcon(getPluginIcon(data.type) || DEFAULT_ICON, { size: 16, color: 'currentColor' }),
    statusText: plugin?.ui?.statusText || DEFAULT_STATUS,
  };

  // Check if node is an entry point
  const isEntryPoint = data.isEntryPoint === true;

  // Search highlight styles
  const searchStyle: React.CSSProperties = {};
  if (data.isSearchMatch) {
    searchStyle.boxShadow = `0 0 20px ${config.color}80, 0 0 40px ${config.color}40`;
    searchStyle.border = `2px solid ${config.color}`;
  }
  if (data.isSearchDimmed) {
    searchStyle.opacity = 0.3;
  }

  // Popover show/hide logic
  const showPopover = useCallback(() => {
    if (popoverHideTimeoutRef.current) {
      clearTimeout(popoverHideTimeoutRef.current);
      popoverHideTimeoutRef.current = null;
    }
    setPopoverVisible(true);
  }, []);

  const scheduleHidePopover = useCallback(() => {
    if (popoverPinned) return;
    popoverHideTimeoutRef.current = setTimeout(() => {
      setPopoverVisible(false);
    }, 200);
  }, [popoverPinned]);

  const cancelHidePopover = useCallback(() => {
    if (popoverHideTimeoutRef.current) {
      clearTimeout(popoverHideTimeoutRef.current);
      popoverHideTimeoutRef.current = null;
    }
  }, []);

  const togglePin = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPopoverPinned((prev) => {
      if (prev) {
        // Unpinning - schedule hide
        popoverHideTimeoutRef.current = setTimeout(() => {
          setPopoverVisible(false);
        }, 200);
      }
      return !prev;
    });
  }, []);

  const copyErrorToClipboard = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const errorMsg = status?.data?.error || status?.data?.validationIssue || '';
    if (errorMsg) {
      navigator.clipboard.writeText(String(errorMsg)).catch(() => {});
    }
  }, [status]);

  // ESC to unpin + click outside to unpin
  useEffect(() => {
    if (!popoverPinned) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopoverPinned(false);
        setPopoverVisible(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-popover-node-id]') && !nodeRef.current?.contains(target)) {
        setPopoverPinned(false);
        setPopoverVisible(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [popoverPinned]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (popoverHideTimeoutRef.current) clearTimeout(popoverHideTimeoutRef.current);
    };
  }, []);

  // Tooltip show/hide with delay
  const handleMouseEnter = () => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 500); // 500ms delay
    if (status && status.status !== 'idle') {
      showPopover();
    }
  };

  const handleMouseLeave = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setShowTooltip(false);
    scheduleHidePopover();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleNodeCollapse(id);
  };

  const handleCollapseToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleNodeCollapse(id);
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
    if (status?.status === 'warning') return 'Warning';
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

  // Get dimensions based on display mode
  const getNodeStyle = (): React.CSSProperties => {
    // Status-based border and glow
    const statusVisual = status?.status ? STATUS_BORDER_COLORS[status.status] : undefined;
    let borderColor = 'rgba(255,255,255,0.1)';
    let boxShadow = '0 4px 20px rgba(0,0,0,0.2)';

    if (selected) {
      borderColor = config.color;
      boxShadow = `0 0 20px ${config.color}40, 0 4px 20px rgba(0,0,0,0.3)`;
    }
    if (statusVisual) {
      borderColor = statusVisual.border;
      boxShadow = `0 0 20px ${statusVisual.glow}, 0 4px 20px rgba(0,0,0,0.3)`;
    }

    const baseStyle: React.CSSProperties = {
      background: config.bgColor,
      border: `2px solid ${borderColor}`,
      borderRadius: '12px',
      boxShadow,
      transition: 'box-shadow 0.3s, border-color 0.3s, opacity 0.2s',
      ...searchStyle,
    };

    if (collapsed) {
      return { ...baseStyle, padding: '8px 12px', minWidth: '120px' };
    }

    switch (nodeDisplayMode) {
      case 'simple':
        return { ...baseStyle, padding: '8px 12px', minWidth: '120px' };
      case 'detailed':
        return { ...baseStyle, padding: '0', minWidth: '220px' };
      default: // standard
        return { ...baseStyle, padding: '12px 16px', minWidth: '180px' };
    }
  };

  // Collapse toggle button
  const CollapseButton = ({ className }: { className?: string }) => (
    <button
      onClick={handleCollapseToggle}
      className={`text-white/40 hover:text-white/80 transition-colors flex-shrink-0 ${className ?? ''}`}
      title={collapsed ? '展開する' : '折りたたむ'}
    >
      {collapsed ? <ChevronRight /> : <ChevronDown />}
    </button>
  );

  // Play button component
  const PlayButton = () => (
    isEntryPoint ? (
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
    ) : null
  );

  // Error/warning badge state for showing details on hover
  const [showErrorTooltip, setShowErrorTooltip] = useState(false);
  const [showWarningTooltip, setShowWarningTooltip] = useState(false);

  // Status indicator component with enhanced error/warning badge
  const StatusIndicator = () => (
    <>
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
      {status?.status === 'warning' && (
        <div
          className="absolute -top-2 -right-2"
          onMouseEnter={() => setShowWarningTooltip(true)}
          onMouseLeave={() => setShowWarningTooltip(false)}
        >
          {/* Warning badge with exclamation mark */}
          <div
            className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center cursor-help"
            style={{
              border: '2px solid #1F2937',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.5)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <line x1="12" y1="8" x2="12" y2="12" />
              <circle cx="12" cy="16" r="1.5" fill="white" />
            </svg>
          </div>

          {/* Warning tooltip */}
          {showWarningTooltip && status?.data?.validationIssue && (
            <div
              className="absolute right-0 top-full mt-1 z-50 pointer-events-none"
              style={{ minWidth: '200px', maxWidth: '300px' }}
            >
              <div className="bg-amber-900/95 backdrop-blur-sm border border-amber-500/50 rounded-lg p-2 shadow-xl">
                <div className="text-[10px] font-semibold text-amber-200 mb-1">Warning</div>
                <div className="text-[11px] text-white/90 leading-relaxed break-words">
                  {status.data.validationIssue}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {status?.status === 'error' && (
        <div
          className="absolute -top-2 -right-2"
          onMouseEnter={() => setShowErrorTooltip(true)}
          onMouseLeave={() => setShowErrorTooltip(false)}
        >
          {/* Error badge with exclamation mark */}
          <div
            className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center cursor-help"
            style={{
              border: '2px solid #1F2937',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.5)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <line x1="12" y1="8" x2="12" y2="12" />
              <circle cx="12" cy="16" r="1.5" fill="white" />
            </svg>
          </div>

          {/* Error tooltip */}
          {showErrorTooltip && (status?.data?.error || status?.data?.validationIssue) && (
            <div
              className="absolute right-0 top-full mt-1 z-50 pointer-events-none"
              style={{ minWidth: '200px', maxWidth: '300px' }}
            >
              <div className="bg-red-900/95 backdrop-blur-sm border border-red-500/50 rounded-lg p-2 shadow-xl">
                <div className="text-[10px] font-semibold text-red-200 mb-1">Error</div>
                <div className="text-[11px] text-white/90 leading-relaxed break-words">
                  {status.data.error || status.data.validationIssue}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  // Tooltip component
  const Tooltip = () => {
    const description = getNodeDesc(data.type);

    return showTooltip ? (
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none"
        style={{ minWidth: '180px', maxWidth: '260px' }}
      >
        <div
          className="bg-gray-900/95 backdrop-blur-sm border border-white/20 rounded-lg p-3 shadow-xl"
        >
          <div className="text-[11px] text-white/90 whitespace-pre-line leading-relaxed">
            {description}
          </div>
        </div>
        {/* Arrow */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-900/95 border-r border-b border-white/20 rotate-45"
        />
      </div>
    ) : null;
  };

  // Port hover tooltip — only renders for the port currently hovered
  const PortTooltip = ({ portId, side }: { portId: string; side: 'input' | 'output' }) => {
    if (!hoveredPort || hoveredPort.id !== portId || hoveredPort.side !== side) return null;
    const typeColor = PORT_TYPE_COLORS[hoveredPort.type] ?? '#6B7280';
    const typeLabel = PORT_TYPE_LABELS[hoveredPort.type] ?? hoveredPort.type;
    return (
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-[60] pointer-events-none"
        style={{ minWidth: '160px', maxWidth: '240px' }}
      >
        <div className="bg-gray-950/98 backdrop-blur-sm border rounded-lg p-2 shadow-xl" style={{ borderColor: `${typeColor}60` }}>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: typeColor }} />
            <span className="text-[11px] font-semibold text-white/90">{hoveredPort.label}</span>
            <span className="text-[10px] ml-auto" style={{ color: typeColor }}>{typeLabel}</span>
          </div>
          {hoveredPort.description && (
            <div className="text-[10px] text-white/60 leading-relaxed">{hoveredPort.description}</div>
          )}
        </div>
      </div>
    );
  };

  // Status popover rendered via portal
  const NodeStatusPopover = () => {
    if (!popoverVisible || !status || status.status === 'idle') return null;

    const statusColor = STATUS_BORDER_COLORS[status.status]?.border ?? '#6B7280';
    const statusLabel = {
      running: 'Running',
      completed: 'Completed',
      error: 'Error',
      warning: 'Warning',
    }[status.status] ?? status.status;
    const duration = status.data?.duration;
    const resultSummary = status.data?.resultSummary;
    const errorMsg = status.data?.error || status.data?.validationIssue;
    const outputs = status.data?.outputs;

    // Calculate position from the node DOM element
    const rect = nodeRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const popoverStyle: React.CSSProperties = {
      position: 'fixed',
      left: rect.right + 12,
      top: rect.top,
      zIndex: 9999,
      pointerEvents: 'auto',
      minWidth: '220px',
      maxWidth: '320px',
    };

    // Keep popover within viewport
    if (rect.right + 12 + 320 > window.innerWidth) {
      popoverStyle.left = rect.left - 12 - 320;
    }

    return createPortal(
      <div
        data-popover-node-id={id}
        style={popoverStyle}
        onMouseEnter={cancelHidePopover}
        onMouseLeave={scheduleHidePopover}
      >
        <div
          className="backdrop-blur-md rounded-lg shadow-2xl overflow-hidden"
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            border: `1px solid ${statusColor}40`,
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2">
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status.status === 'running' ? 'animate-pulse' : ''}`}
              style={{ background: statusColor }}
            />
            <span className="text-[12px] font-semibold text-white truncate flex-1">
              {data.label}
            </span>
            {duration !== undefined && (
              <span className="text-[10px] text-white/50 flex-shrink-0">
                {formatDuration(duration)}
              </span>
            )}
            <button
              onClick={togglePin}
              className={`w-5 h-5 flex items-center justify-center rounded transition-colors flex-shrink-0 ${
                popoverPinned ? 'text-blue-400 bg-blue-400/20' : 'text-white/30 hover:text-white/60'
              }`}
              title={popoverPinned ? 'Unpin' : 'Pin'}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill={popoverPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M12 2v8m0 4v8M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M2 12h8m4 0h8M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24"/>
              </svg>
            </button>
          </div>

          {/* Divider */}
          <div className="h-px" style={{ background: `${statusColor}30` }} />

          {/* Status message */}
          <div
            className="px-3 py-2 text-[11px] font-medium"
            style={{
              background: `${statusColor}10`,
              color: statusColor,
            }}
          >
            {statusLabel}
            {status.status === 'running' && '...'}
          </div>

          {/* Detail rows */}
          <div className="px-3 py-2 space-y-1.5">
            {resultSummary && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-white/40 w-14 flex-shrink-0">Result</span>
                <span className="text-[11px] text-white/80">{String(resultSummary)}</span>
              </div>
            )}
            {errorMsg && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-red-400/70 w-14 flex-shrink-0">Error</span>
                <span className="text-[11px] text-red-300 break-words flex-1">{String(errorMsg)}</span>
              </div>
            )}
            {duration !== undefined && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-white/40 w-14 flex-shrink-0">Duration</span>
                <span className="text-[11px] text-white/80">{formatDuration(duration)}</span>
              </div>
            )}
          </div>

          {/* Output preview */}
          {outputs && Object.keys(outputs).length > 0 && (
            <div className="px-3 pb-2">
              <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Output Preview</div>
              <pre
                className="text-[10px] text-white/60 bg-black/30 rounded p-2 overflow-auto max-h-[80px] whitespace-pre-wrap break-words"
                style={{ fontFamily: 'monospace' }}
              >
                {JSON.stringify(outputs, null, 2).slice(0, 500)}
              </pre>
            </div>
          )}

          {/* Copy error button */}
          {(status.status === 'error' || status.status === 'warning') && errorMsg && (
            <div className="px-3 pb-2 flex justify-end">
              <button
                onClick={copyErrorToClipboard}
                className="text-white/30 hover:text-white/70 transition-colors p-1 rounded hover:bg-white/10"
                title="Copy error message"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>,
      document.body
    );
  };

  /** Return handle style based on drag compatibility */
  const getHandleStyle = (portType: PortType, isTarget: boolean): React.CSSProperties => {
    const base: React.CSSProperties = {
      borderRadius: '50%',
      border: '2px solid #1F2937',
      position: 'relative',
      transition: 'opacity 0.15s, box-shadow 0.15s, width 0.15s, height 0.15s',
    };
    if (!draggingSourceType) {
      // idle: normal appearance
      return { ...base, width: '14px', height: '14px', background: PORT_TYPE_COLORS[portType] ?? '#374151' };
    }
    // Something is being dragged — check compatibility
    const compatible = isTarget
      ? arePortTypesCompatible(draggingSourceType, portType)
      : arePortTypesCompatible(portType, draggingSourceType);

    if (compatible) {
      // Grow via width/height (not transform): React Flow positions handles with a
      // size-relative translate, so enlarging keeps the circle centered and expanding
      // symmetrically. Overriding `transform` here would drop that translate and shift
      // the handle off-center (different per side: left vs right).
      return {
        ...base,
        width: '20px',
        height: '20px',
        background: PORT_TYPE_COLORS[portType] ?? '#374151',
        boxShadow: `0 0 8px ${PORT_TYPE_COLORS[portType] ?? '#374151'}`,
      };
    } else {
      return { ...base, width: '14px', height: '14px', background: '#374151', opacity: 0.25 };
    }
  };
  if (collapsed) {
    return (
      <div
        ref={nodeRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
        style={getNodeStyle()}
      >
        <Tooltip />
        <PlayButton />
        <NodeStatusPopover />

        {/* Input handles (kept for edge connections) */}
        {data.inputs && data.inputs.length > 0 && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 flex flex-col gap-1">
            {data.inputs.map((input) => (
              <Handle
                key={input.id}
                type="target"
                position={Position.Left}
                id={input.id}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: PORT_TYPE_COLORS[input.type] || '#374151',
                  border: '2px solid #1F2937',
                  position: 'relative',
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        )}

        {/* Output handles (kept for edge connections) */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 flex flex-col gap-1">
            {data.outputs.map((output) => (
              <Handle
                key={output.id}
                type="source"
                position={Position.Right}
                id={output.id}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: PORT_TYPE_COLORS[output.type] || config.color,
                  border: '2px solid #1F2937',
                  position: 'relative',
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        )}

        {/* Compact header with collapse toggle */}
        <div className="flex items-center gap-2">
          <CollapseButton />
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              background: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <span className="font-semibold text-[11px] text-white truncate">
            {data.label}
          </span>
        </div>

        <StatusIndicator />
      </div>
    );
  }

  // ============ SIMPLE MODE ============
  if (nodeDisplayMode === 'simple') {
    return (
      <div
        ref={nodeRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
        style={getNodeStyle()}
      >
        <Tooltip />
        <PlayButton />
        <NodeStatusPopover />

        {/* Input handles - simple circles */}
        {data.inputs && data.inputs.length > 0 && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 flex flex-col gap-1">
            {data.inputs.map((input) => (
              <Handle
                key={input.id}
                type="target"
                position={Position.Left}
                id={input.id}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: PORT_TYPE_COLORS[input.type] || '#374151',
                  border: '2px solid #1F2937',
                  position: 'relative',
                }}
              />
            ))}
          </div>
        )}

        {/* Output handles - simple circles */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 flex flex-col gap-1">
            {data.outputs.map((output) => (
              <Handle
                key={output.id}
                type="source"
                position={Position.Right}
                id={output.id}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: PORT_TYPE_COLORS[output.type] || config.color,
                  border: '2px solid #1F2937',
                  position: 'relative',
                }}
              />
            ))}
          </div>
        )}

        {/* Compact header - icon and label only */}
        <div className="flex items-center gap-2">
          <CollapseButton />
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              background: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <span className="font-semibold text-[12px] text-white truncate">
            {data.label}
          </span>
        </div>

        <StatusIndicator />
      </div>
    );
  }

  // ============ DETAILED MODE ============
  if (nodeDisplayMode === 'detailed') {
    return (
      <div
        ref={nodeRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
        style={getNodeStyle()}
      >
        <Tooltip />
        <PlayButton />
        <NodeStatusPopover />

        {/* Header section */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          <CollapseButton />
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              background: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <span className="font-semibold text-[12px] text-white">
            {data.label}
          </span>
        </div>

        {/* Inputs section */}
        {data.inputs && data.inputs.length > 0 && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Inputs</div>
            {data.inputs.map((input) => (
              <div key={input.id} className="flex items-center gap-2 py-1 relative">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={input.id}
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: PORT_TYPE_COLORS[input.type] || '#374151',
                    border: '1px solid #1F2937',
                    left: '-5px',
                    position: 'absolute',
                  }}
                />
                <span className="text-[11px] text-white/80 ml-2">{input.label}</span>
                <span
                  className="text-[9px] ml-auto"
                  style={{ color: PORT_TYPE_COLORS[input.type] || '#6B7280' }}
                >
                  {input.type}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Outputs section */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Outputs</div>
            {data.outputs.map((output) => (
              <div key={output.id} className="flex items-center gap-2 py-1 relative">
                <span
                  className="text-[9px]"
                  style={{ color: PORT_TYPE_COLORS[output.type] || '#6B7280' }}
                >
                  {output.type}
                </span>
                <span className="text-[11px] text-white/80 ml-auto mr-2">{output.label}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: PORT_TYPE_COLORS[output.type] || config.color,
                    border: '1px solid #1F2937',
                    right: '-5px',
                    position: 'absolute',
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Status footer */}
        <div className="px-3 py-2 text-[10px] text-white/50">
          {getStatusText()}
        </div>

        {/* Inline fields */}
        {data.pluginConfig && (
          <div className="px-3 pb-2">
            <InlineFields
              config={data.config}
              pluginConfig={data.pluginConfig}
              onConfigChange={onInlineConfigChange}
              accentColor={config.color}
            />
          </div>
        )}

        <StatusIndicator />
      </div>
    );
  }

  // ============ STANDARD MODE (default) ============
  const inputCount = data.inputs?.length || 0;
  const outputCount = data.outputs?.length || 0;
  const maxPorts = Math.max(inputCount, outputCount);

  return (
    <div
      ref={nodeRef}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative"
      style={getNodeStyle()}
    >
      <Tooltip />
      <PlayButton />
      <NodeStatusPopover />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <CollapseButton />
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
            flexShrink: 0,
          }}
        >
          {config.icon}
        </div>
        <span className="font-semibold text-[13px] text-white truncate">
          {data.label}
        </span>
      </div>

      {/* Ports section - only show if there are ports */}
      {maxPorts > 0 && (
        <div className="flex justify-between gap-4 my-2">
          {/* Input ports */}
          <div className="flex flex-col gap-1">
            {data.inputs?.map((input) => (
              <div
                key={input.id}
                className="flex items-center gap-1 relative h-5"
                onMouseEnter={() => setHoveredPort({ id: input.id, label: input.label, type: input.type as PortType, description: (input as any).description, side: 'input' })}
                onMouseLeave={() => setHoveredPort(null)}
              >
                <PortTooltip portId={input.id} side="input" />
                <Handle
                  type="target"
                  position={Position.Left}
                  id={input.id}
                  style={{ ...getHandleStyle(input.type as PortType, true), left: '-7px', position: 'absolute' }}
                />
                <span className="text-[10px] text-white/60 pl-2 whitespace-nowrap">
                  {input.label}
                </span>
              </div>
            ))}
          </div>

          {/* Output ports */}
          <div className="flex flex-col gap-1 items-end">
            {data.outputs?.map((output) => (
              <div
                key={output.id}
                className="flex items-center gap-1 relative h-5"
                onMouseEnter={() => setHoveredPort({ id: output.id, label: output.label, type: output.type as PortType, description: (output as any).description, side: 'output' })}
                onMouseLeave={() => setHoveredPort(null)}
              >
                <PortTooltip portId={output.id} side="output" />
                <span className="text-[10px] text-white/60 pr-2 whitespace-nowrap">
                  {output.label}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  style={{ ...getHandleStyle(output.type as PortType, false), right: '-7px', position: 'absolute' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="text-[10px] text-white/40 truncate">
        {getStatusText()}
      </div>

      {/* Inline fields */}
      {data.pluginConfig && (
        <InlineFields
          config={data.config}
          pluginConfig={data.pluginConfig}
          onConfigChange={onInlineConfigChange}
        />
      )}

      <StatusIndicator />
    </div>
  );
}

export default memo(CustomNode);
