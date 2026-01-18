'use client';

import React, { useCallback, useRef, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/stores/workflowStore';
import CustomNode, { type CustomNodeData } from './CustomNode';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import { nodeTypes as sidebarNodeTypes } from './Sidebar';

interface CanvasProps {
  onNodeSelect?: (nodeId: string | null) => void;
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// Node type colors for edge styling
const nodeTypeColors: Record<string, string> = {
  'youtube-chat': '#FF0000',
  'twitch-chat': '#9146FF',
  'manual-input': '#22C55E',
  'openai-llm': '#10B981',
  'voicevox-tts': '#F59E0B',
  'console-output': '#A855F7',
  'switch': '#F97316',
  'delay': '#F97316',
};

interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  type: 'pane' | 'node';
  nodeId?: string;
}

export default function Canvas({ onNodeSelect }: CanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    show: false,
    x: 0,
    y: 0,
    type: 'pane',
  });

  const {
    nodes: workflowNodes,
    connections,
    addNode,
    setNodePosition,
    addConnection,
    removeConnection,
    selectNode,
    selectedNodeId,
    removeNode,
  } = useWorkflowStore();

  // Convert workflow nodes to React Flow nodes
  const flowNodes: Node[] = useMemo(
    () =>
      workflowNodes.map((node) => ({
        id: node.id,
        type: 'custom',
        position: node.position,
        data: {
          label: getNodeLabel(node.type),
          type: node.type,
          category: getNodeCategory(node.type),
          config: node.config,
          inputs: getNodeInputs(node.type),
          outputs: getNodeOutputs(node.type),
        } as CustomNodeData,
        selected: node.id === selectedNodeId,
      })),
    [workflowNodes, selectedNodeId]
  );

  // Convert workflow connections to React Flow edges with gradient style
  const flowEdges: Edge[] = useMemo(
    () =>
      connections.map((conn) => {
        const sourceNode = workflowNodes.find((n) => n.id === conn.from.nodeId);
        const edgeColor = sourceNode ? nodeTypeColors[sourceNode.type] || '#10B981' : '#10B981';
        return {
          id: conn.id,
          source: conn.from.nodeId,
          sourceHandle: conn.from.port,
          target: conn.to.nodeId,
          targetHandle: conn.to.port,
          animated: true,
          style: {
            stroke: edgeColor,
            strokeWidth: 3,
            filter: `drop-shadow(0 0 4px ${edgeColor}50)`,
          },
        };
      }),
    [connections, workflowNodes]
  );

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(flowEdges);

  // Sync React Flow state with store when nodes/edges change externally
  React.useEffect(() => {
    setNodes(flowNodes);
  }, [flowNodes, setNodes]);

  React.useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChangeInternal(changes);

      // Handle position changes
      changes.forEach((change) => {
        if (change.type === 'position' && change.position) {
          setNodePosition(change.id, change.position);
        }
        if (change.type === 'remove') {
          removeNode(change.id);
        }
      });
    },
    [onNodesChangeInternal, setNodePosition, removeNode]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChangeInternal(changes);

      changes.forEach((change) => {
        if (change.type === 'remove') {
          removeConnection(change.id);
        }
      });
    },
    [onEdgesChangeInternal, removeConnection]
  );

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target && params.sourceHandle && params.targetHandle) {
        addConnection({
          from: { nodeId: params.source, port: params.sourceHandle },
          to: { nodeId: params.target, port: params.targetHandle },
        });
      }
    },
    [addConnection]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id);
      onNodeSelect?.(node.id);
    },
    [selectNode, onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    onNodeSelect?.(null);
    setContextMenu({ show: false, x: 0, y: 0, type: 'pane' });
  }, [selectNode, onNodeSelect]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const data = event.dataTransfer.getData('application/json');
      if (!data) return;

      try {
        const { nodeType, defaultConfig } = JSON.parse(data);

        const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
        if (!reactFlowBounds) return;

        const position = {
          x: event.clientX - reactFlowBounds.left - 80,
          y: event.clientY - reactFlowBounds.top - 30,
        };

        addNode({
          type: nodeType,
          position,
          config: defaultConfig || {},
        });
      } catch (e) {
        console.error('Failed to parse drop data:', e);
      }
    },
    [addNode]
  );

  // Right-click context menu handlers
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setContextMenu({
        show: true,
        x: event.clientX,
        y: event.clientY,
        type: 'node',
        nodeId: node.id,
      });
      selectNode(node.id);
    },
    [selectNode]
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      setContextMenu({
        show: true,
        x: event.clientX,
        y: event.clientY,
        type: 'pane',
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu({ show: false, x: 0, y: 0, type: 'pane' });
  }, []);

  // Get context menu items based on type
  const getContextMenuItems = (): ContextMenuItem[] => {
    if (contextMenu.type === 'node' && contextMenu.nodeId) {
      const node = workflowNodes.find((n) => n.id === contextMenu.nodeId);
      return [
        {
          label: 'Duplicate',
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          ),
          onClick: () => {
            if (node) {
              addNode({
                type: node.type,
                position: { x: node.position.x + 50, y: node.position.y + 50 },
                config: { ...node.config },
              });
            }
          },
        },
        {
          label: 'Delete',
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          ),
          onClick: () => {
            if (contextMenu.nodeId) {
              removeNode(contextMenu.nodeId);
            }
          },
          danger: true,
          divider: true,
        },
      ];
    }

    // Pane context menu - add nodes
    return sidebarNodeTypes.map((nodeType) => ({
      label: `Add ${nodeType.label}`,
      icon: <span style={{ color: nodeType.color }}>{nodeType.icon}</span>,
      onClick: () => {
        const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
        if (!reactFlowBounds) return;

        addNode({
          type: nodeType.id,
          position: {
            x: contextMenu.x - reactFlowBounds.left - 80,
            y: contextMenu.y - reactFlowBounds.top - 30,
          },
          config: { ...nodeType.defaultConfig },
        });
      },
    }));
  };

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full relative">
      {/* Gradient background overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
        }}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        fitView
        className="!bg-transparent"
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#10B981', strokeWidth: 3 },
        }}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Shift']}
      >
        <Background
          color="rgba(255,255,255,0.03)"
          gap={40}
          size={1}
          style={{ background: 'transparent' }}
        />
        <Controls className="!bg-black/50 !border-white/10 !rounded-lg" />
      </ReactFlow>

      {/* Context Menu */}
      {contextMenu.show && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

// Helper functions to get node metadata
function getNodeLabel(type: string): string {
  const labels: Record<string, string> = {
    'manual-input': 'Manual Input',
    'youtube-chat': 'YouTube Chat',
    'twitch-chat': 'Twitch Chat',
    'openai-llm': 'LLM',
    'switch': 'Switch',
    'delay': 'Delay',
    'console-output': 'Console Output',
    'voicevox-tts': 'TTS',
  };
  return labels[type] || type;
}

function getNodeCategory(type: string): 'input' | 'process' | 'output' | 'control' {
  const categories: Record<string, 'input' | 'process' | 'output' | 'control'> = {
    'manual-input': 'input',
    'youtube-chat': 'input',
    'twitch-chat': 'input',
    'openai-llm': 'process',
    'switch': 'control',
    'delay': 'control',
    'console-output': 'output',
    'voicevox-tts': 'output',
  };
  return categories[type] || 'process';
}

function getNodeInputs(type: string): { id: string; label: string }[] {
  const inputs: Record<string, { id: string; label: string }[]> = {
    'manual-input': [],
    'youtube-chat': [],
    'twitch-chat': [],
    'openai-llm': [{ id: 'prompt', label: 'Prompt' }],
    'switch': [
      { id: 'value', label: 'Value' },
      { id: 'data', label: 'Data' },
    ],
    'delay': [{ id: 'input', label: 'Input' }],
    'console-output': [{ id: 'text', label: 'Text' }],
    'voicevox-tts': [{ id: 'text', label: 'Text' }],
  };
  return inputs[type] || [];
}

function getNodeOutputs(type: string): { id: string; label: string }[] {
  const outputs: Record<string, { id: string; label: string }[]> = {
    'manual-input': [{ id: 'text', label: 'Text' }],
    'youtube-chat': [{ id: 'message', label: 'Message' }],
    'twitch-chat': [{ id: 'message', label: 'Message' }],
    'openai-llm': [{ id: 'response', label: 'Response' }],
    'switch': [
      { id: 'true', label: 'True' },
      { id: 'false', label: 'False' },
    ],
    'delay': [{ id: 'output', label: 'Output' }],
    'console-output': [],
    'voicevox-tts': [{ id: 'audio', label: 'Audio' }],
  };
  return outputs[type] || [];
}
