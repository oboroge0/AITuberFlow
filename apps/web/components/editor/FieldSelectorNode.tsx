'use client';

import React, { memo, useCallback, useMemo } from 'react';
import { Handle, Position, type Node as ReactFlowNode } from '@xyflow/react';
import { useWorkflowStore } from '@/stores/workflowStore';

export interface FieldSelectorNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  category: 'process';
  config: {
    selectedFields?: string[];
  };
  inputs?: { id: string; label: string }[];
  outputs?: { id: string; label: string }[];
}

export type FieldSelectorNodeType = ReactFlowNode<FieldSelectorNodeData>;

// Known output fields for each node type
const nodeOutputFields: Record<string, string[]> = {
  'twitch-chat': ['text', 'author', 'message'],
  'youtube-chat': ['text', 'author', 'message'],
  'manual-input': ['text'],
  'openai-llm': ['response'],
  'anthropic-llm': ['response'],
  'google-llm': ['response'],
  'ollama-llm': ['response'],
  'timer': ['tick', 'count'],
  'http-request': ['response', 'status', 'headers'],
  'text-transform': ['result'],
  'data-formatter': ['formatted', 'parsed'],
  'field-selector': ['output'],
  'template-editor': ['output'],
  'random': ['value'],
  'variable': ['value'],
  'switch': ['value', 'data'],
  'delay': ['output'],
  'loop': ['index', 'value'],
  'foreach': ['item', 'index'],
};

interface FieldSelectorNodeProps {
  id: string;
  data: FieldSelectorNodeData;
  selected?: boolean;
}

function FieldSelectorNode({ id, data, selected }: FieldSelectorNodeProps) {
  const { nodeStatuses, selectNode, updateNode, connections, nodes } = useWorkflowStore();
  const status = nodeStatuses[id];

  const color = '#8B5CF6';
  const bgColor = 'rgba(139, 92, 246, 0.15)';

  // Get available fields from connected upstream nodes
  const availableFields = useMemo(() => {
    const fields: string[] = [];
    const seenFields = new Set<string>();

    const incomingConnections = connections.filter(
      (conn) => conn.to.nodeId === id
    );

    for (const conn of incomingConnections) {
      const sourceNode = nodes.find((n) => n.id === conn.from.nodeId);
      if (!sourceNode) continue;

      const fieldPaths = conn.from.fieldPaths || [];
      if (fieldPaths.length > 0) {
        for (const path of fieldPaths) {
          const fieldName = path.split('.').pop() || path;
          if (!seenFields.has(fieldName)) {
            seenFields.add(fieldName);
            fields.push(fieldName);
          }
        }
      } else {
        const schemaFields = nodeOutputFields[sourceNode.type] || [];
        for (const field of schemaFields) {
          if (!seenFields.has(field)) {
            seenFields.add(field);
            fields.push(field);
          }
        }
      }
    }

    return fields;
  }, [id, connections, nodes]);

  const selectedFields = data.config?.selectedFields || [];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(id);
  };

  const toggleField = useCallback((fieldName: string) => {
    const currentSelected = data.config?.selectedFields || [];
    let newSelected: string[];

    if (currentSelected.includes(fieldName)) {
      newSelected = currentSelected.filter((f) => f !== fieldName);
    } else {
      newSelected = [...currentSelected, fieldName];
    }

    updateNode(id, {
      config: { ...data.config, selectedFields: newSelected },
    });
  }, [id, data.config, updateNode]);

  return (
    <div
      onClick={handleClick}
      className="relative"
      style={{
        background: bgColor,
        border: `2px solid ${selected ? color : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '12px',
        padding: '10px 12px',
        minWidth: '160px',
        boxShadow: selected
          ? `0 0 20px ${color}40, 0 4px 20px rgba(0,0,0,0.3)`
          : '0 4px 20px rgba(0,0,0,0.2)',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: '#374151',
          border: '2px solid #1F2937',
          left: '-10px',
          top: '50%',
        }}
      />

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: color,
          border: '2px solid #1F2937',
          right: '-10px',
          top: '50%',
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '5px',
            background: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        </div>
        <span className="font-semibold text-[11px] text-white">
          Field Selector
        </span>
      </div>

      {/* Field List */}
      {availableFields.length > 0 ? (
        <div className="space-y-1">
          {availableFields.map((field) => {
            const isSelected = selectedFields.includes(field);
            return (
              <button
                key={field}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleField(field);
                }}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-all ${
                  isSelected
                    ? 'bg-violet-500/25 text-violet-200'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                }`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                    isSelected
                      ? 'bg-violet-500 border-violet-500'
                      : 'border-white/30 bg-transparent'
                  }`}
                >
                  {isSelected && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="text-[11px] font-medium">{field}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-[10px] text-white/30 text-center py-2">
          Connect a node
        </div>
      )}

      {/* Status indicators */}
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

export default memo(FieldSelectorNode);
