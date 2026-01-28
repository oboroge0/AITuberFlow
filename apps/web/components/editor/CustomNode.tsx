'use client';

import React, { memo, useState, useRef } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';
import { useWorkflowStore } from '@/stores/workflowStore';
import { usePluginStore } from '@/stores/pluginStore';
import { useUIPreferencesStore, type NodeDisplayMode } from '@/stores/uiPreferencesStore';
import { useLocaleStore } from '@/stores/localeStore';
import { type PortDefinition, PORT_TYPE_COLORS } from '@/lib/portTypes';
import { renderIcon } from '@/lib/icons';

export interface CustomNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  category: 'input' | 'process' | 'output' | 'control';
  config: Record<string, unknown>;
  inputs?: PortDefinition[];
  outputs?: PortDefinition[];
  isReachable?: boolean;  // Whether this node is reachable from Start
  isEntryPoint?: boolean; // Whether this node can start execution (no inputs)
  onPlayClick?: () => void; // Callback when play button is clicked
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

function CustomNode({ id, data, selected }: CustomNodeProps) {
  const { nodeStatuses, selectNode } = useWorkflowStore();
  const { getPluginColor, getPluginBgColor, getPluginIcon, getPluginById } = usePluginStore();
  const { nodeDisplayMode } = useUIPreferencesStore();
  const { getNodeDesc } = useLocaleStore();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const status = nodeStatuses[id];

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

  // Tooltip show/hide with delay
  const handleMouseEnter = () => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 500); // 500ms delay
  };

  const handleMouseLeave = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setShowTooltip(false);
  };

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

  // Get dimensions based on display mode
  const getNodeStyle = () => {
    const baseStyle = {
      background: config.bgColor,
      border: `2px solid ${selected ? config.color : 'rgba(255,255,255,0.1)'}`,
      borderRadius: '12px',
      boxShadow: selected
        ? `0 0 20px ${config.color}40, 0 4px 20px rgba(0,0,0,0.3)`
        : '0 4px 20px rgba(0,0,0,0.2)',
      transition: 'box-shadow 0.2s, border-color 0.2s',
    };

    switch (nodeDisplayMode) {
      case 'simple':
        return { ...baseStyle, padding: '8px 12px', minWidth: '120px' };
      case 'detailed':
        return { ...baseStyle, padding: '0', minWidth: '220px' };
      default: // standard
        return { ...baseStyle, padding: '12px 16px', minWidth: '180px' };
    }
  };

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

  // Status indicator component
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
      {status?.status === 'error' && (
        <div className="absolute -top-1 -right-1">
          <span className="w-3 h-3 rounded-full bg-red-400 block" />
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

  // ============ SIMPLE MODE ============
  if (nodeDisplayMode === 'simple') {
    return (
      <div
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
        style={getNodeStyle()}
      >
        <Tooltip />
        <PlayButton />

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
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
        style={getNodeStyle()}
      >
        <Tooltip />
        <PlayButton />

        {/* Header section */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
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
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative"
      style={getNodeStyle()}
    >
      <Tooltip />
      <PlayButton />

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
              <div key={input.id} className="flex items-center gap-1 relative h-5">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={input.id}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: PORT_TYPE_COLORS[input.type] || '#374151',
                    border: '2px solid #1F2937',
                    left: '-6px',
                    position: 'absolute',
                  }}
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
              <div key={output.id} className="flex items-center gap-1 relative h-5">
                <span className="text-[10px] text-white/60 pr-2 whitespace-nowrap">
                  {output.label}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: PORT_TYPE_COLORS[output.type] || config.color,
                    border: '2px solid #1F2937',
                    right: '-6px',
                    position: 'absolute',
                  }}
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

      <StatusIndicator />
    </div>
  );
}

export default memo(CustomNode);
