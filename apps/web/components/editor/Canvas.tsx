'use client';

import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnReconnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/stores/workflowStore';
import CustomNode, { type CustomNodeData } from './CustomNode';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import { nodeTypes as sidebarNodeTypes } from './Sidebar';

interface CanvasProps {
  onNodeSelect?: (nodeId: string | null) => void;
  onSave?: () => void;
  onRunWorkflow?: () => void;
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// Node type colors for edge styling
const nodeTypeColors: Record<string, string> = {
  // Control flow
  'start': '#10B981',
  'end': '#EF4444',
  'loop': '#F59E0B',
  'foreach': '#F97316',
  // Input
  'youtube-chat': '#FF0000',
  'twitch-chat': '#9146FF',
  'manual-input': '#22C55E',
  'timer': '#06B6D4',
  // LLM
  'openai-llm': '#10B981',
  'anthropic-llm': '#D97706',
  'google-llm': '#4285F4',
  'ollama-llm': '#6B7280',
  // TTS
  'voicevox-tts': '#F59E0B',
  'coeiroink-tts': '#E91E63',
  'sbv2-tts': '#9C27B0',
  // Output
  'console-output': '#A855F7',
  // Control
  'switch': '#F97316',
  'delay': '#F97316',
  // Utility
  'http-request': '#3B82F6',
  'text-transform': '#EC4899',
  'random': '#8B5CF6',
  'variable': '#14B8A6',
  // Avatar
  'avatar-display': '#E879F9',
  'emotion-analyzer': '#F472B6',
  'lip-sync': '#FB7185',
};

interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  type: 'pane' | 'node' | 'edge';
  nodeId?: string;
  edgeId?: string;
}

// Wrapper component to provide ReactFlowProvider context
export default function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ onNodeSelect, onSave, onRunWorkflow }: CanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
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
    updateConnection,
    removeConnection,
    selectNode,
    selectedNodeId,
    removeNode,
    undo,
    redo,
    copySelectedNodes,
    pasteNodes,
  } = useWorkflowStore();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input field
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      // Ctrl+Z: Undo
      if (isCtrlOrCmd && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }

      // Ctrl+Y or Ctrl+Shift+Z: Redo
      if (isCtrlOrCmd && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        redo();
      }

      // Ctrl+C: Copy
      if (isCtrlOrCmd && event.key === 'c') {
        event.preventDefault();
        copySelectedNodes();
      }

      // Ctrl+V: Paste
      if (isCtrlOrCmd && event.key === 'v') {
        event.preventDefault();
        pasteNodes();
      }

      // Ctrl+S: Save
      if (isCtrlOrCmd && event.key === 's') {
        event.preventDefault();
        onSave?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, copySelectedNodes, pasteNodes, onSave]);

  // Calculate which nodes are reachable from Start nodes
  const { reachableNodes, hasStartNode } = useMemo(() => {
    // Build adjacency list
    const adjacency: Record<string, string[]> = {};
    workflowNodes.forEach((n) => {
      adjacency[n.id] = [];
    });

    connections.forEach((conn) => {
      const fromId = conn.from.nodeId;
      const toId = conn.to.nodeId;
      if (fromId && toId && adjacency[fromId]) {
        adjacency[fromId].push(toId);
      }
    });

    // Find Start nodes
    const startNodes = workflowNodes.filter((n) => n.type === 'start').map((n) => n.id);
    const hasStart = startNodes.length > 0;

    // If no Start node, all nodes with no incoming connections are entry points
    let entryPoints: string[];
    if (hasStart) {
      entryPoints = startNodes;
    } else {
      // Find nodes with no incoming connections
      const incomingCount: Record<string, number> = {};
      workflowNodes.forEach((n) => {
        incomingCount[n.id] = 0;
      });
      connections.forEach((conn) => {
        if (incomingCount[conn.to.nodeId] !== undefined) {
          incomingCount[conn.to.nodeId]++;
        }
      });
      entryPoints = Object.entries(incomingCount)
        .filter(([, count]) => count === 0)
        .map(([id]) => id);
    }

    // BFS to find all reachable nodes
    const reachable = new Set<string>();
    const queue = [...entryPoints];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) continue;
      reachable.add(nodeId);
      (adjacency[nodeId] || []).forEach((neighbor) => {
        if (!reachable.has(neighbor)) {
          queue.push(neighbor);
        }
      });
    }

    return { reachableNodes: reachable, hasStartNode: hasStart };
  }, [workflowNodes, connections]);

  // Convert workflow nodes to React Flow nodes
  const flowNodes: Node[] = useMemo(
    () => {
      // Entry point node types (nodes with no inputs that can start execution)
      const entryPointTypes = new Set(['start', 'manual-input', 'youtube-chat', 'twitch-chat', 'timer']);

      return workflowNodes.map((node) => {
        const nodeInputs = getNodeInputs(node.type);
        const isEntryPoint = entryPointTypes.has(node.type) || nodeInputs.length === 0;
        const isReachable = !hasStartNode || reachableNodes.has(node.id);

        return {
          id: node.id,
          type: 'custom',
          position: node.position,
          data: {
            label: getNodeLabel(node.type),
            type: node.type,
            category: getNodeCategory(node.type),
            config: node.config,
            inputs: nodeInputs,
            outputs: getNodeOutputs(node.type),
            isReachable,
            isEntryPoint,
            onPlayClick: onRunWorkflow,
          } as CustomNodeData,
          selected: node.id === selectedNodeId,
        };
      });
    },
    [workflowNodes, selectedNodeId, reachableNodes, hasStartNode, onRunWorkflow]
  );

  // Convert workflow connections to React Flow edges with gradient style
  // Lines to/from unreachable nodes are dashed
  const flowEdges: Edge[] = useMemo(
    () =>
      connections.map((conn) => {
        const sourceNode = workflowNodes.find((n) => n.id === conn.from.nodeId);
        const edgeColor = sourceNode ? nodeTypeColors[sourceNode.type] || '#10B981' : '#10B981';

        // Check if this edge involves unreachable nodes (only when Start node exists)
        const sourceReachable = !hasStartNode || reachableNodes.has(conn.from.nodeId);
        const targetReachable = !hasStartNode || reachableNodes.has(conn.to.nodeId);
        const isReachableEdge = sourceReachable && targetReachable;

        return {
          id: conn.id,
          source: conn.from.nodeId,
          sourceHandle: conn.from.port,
          target: conn.to.nodeId,
          targetHandle: conn.to.port,
          animated: true, // Always animate edges
          style: {
            stroke: edgeColor,
            strokeWidth: 3,
            strokeDasharray: isReachableEdge ? undefined : '8 4', // Dashed for unreachable
            filter: `drop-shadow(0 0 4px ${edgeColor}50)`,
          },
        };
      }),
    [connections, workflowNodes, reachableNodes, hasStartNode]
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

  // Track if edge was successfully reconnected
  const edgeReconnectSuccessful = useRef(true);

  // Called when edge reconnection starts
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  // Handle edge reconnection (dragging edge end to a new target)
  const onReconnect: OnReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      if (newConnection.source && newConnection.target && newConnection.sourceHandle && newConnection.targetHandle) {
        updateConnection(oldEdge.id, {
          from: { nodeId: newConnection.source, port: newConnection.sourceHandle },
          to: { nodeId: newConnection.target, port: newConnection.targetHandle },
        });
      }
    },
    [updateConnection]
  );

  // Called when edge reconnection ends - delete edge if not reconnected
  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        removeConnection(edge.id);
      }
      edgeReconnectSuccessful.current = true;
    },
    [removeConnection]
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

        // Use screenToFlowPosition for accurate positioning with zoom/pan
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        // Offset to center the node on the drop point
        position.x -= 80;
        position.y -= 30;

        addNode({
          type: nodeType,
          position,
          config: defaultConfig || {},
        });
      } catch (e) {
        console.error('Failed to parse drop data:', e);
      }
    },
    [addNode, screenToFlowPosition]
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

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({
        show: true,
        x: event.clientX,
        y: event.clientY,
        type: 'edge',
        edgeId: edge.id,
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
          label: 'Copy',
          shortcut: 'Ctrl+C',
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          ),
          onClick: () => {
            copySelectedNodes();
          },
        },
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
          shortcut: 'Del',
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

    // Edge context menu
    if (contextMenu.type === 'edge' && contextMenu.edgeId) {
      return [
        {
          label: 'Delete Connection',
          shortcut: 'Del',
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          ),
          onClick: () => {
            if (contextMenu.edgeId) {
              removeConnection(contextMenu.edgeId);
            }
          },
          danger: true,
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
        onReconnectStart={onReconnectStart}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        reconnectRadius={10}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
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
        <Controls
          className="!bg-gray-800/90 !border-white/20 !rounded-lg !shadow-lg"
          showZoom={true}
          showFitView={true}
          showInteractive={true}
        />
      </ReactFlow>

      {/* Custom styles for React Flow */}
      <style jsx global>{`
        .react-flow__controls {
          background: rgba(31, 41, 55, 0.95) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
        }
        .react-flow__controls-button {
          background: transparent !important;
          border: none !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
          color: white !important;
          width: 28px !important;
          height: 28px !important;
          padding: 4px !important;
        }
        .react-flow__controls-button:last-child {
          border-bottom: none !important;
        }
        .react-flow__controls-button:hover {
          background: rgba(255, 255, 255, 0.1) !important;
        }
        .react-flow__controls-button svg {
          fill: white !important;
          max-width: 14px !important;
          max-height: 14px !important;
        }
        .react-flow__attribution {
          display: none !important;
        }
      `}</style>

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
    // Control flow
    'start': 'Start',
    'end': 'End',
    'loop': 'Loop',
    'foreach': 'ForEach',
    // Input
    'manual-input': 'Manual Input',
    'youtube-chat': 'YouTube Chat',
    'twitch-chat': 'Twitch Chat',
    'timer': 'Timer',
    // LLM
    'openai-llm': 'ChatGPT',
    'anthropic-llm': 'Claude',
    'google-llm': 'Gemini',
    'ollama-llm': 'Ollama',
    // Control
    'switch': 'Switch',
    'delay': 'Delay',
    // Output
    'console-output': 'Console Output',
    'voicevox-tts': 'VOICEVOX',
    'coeiroink-tts': 'COEIROINK',
    'sbv2-tts': 'Style-Bert-VITS2',
    // Utility
    'http-request': 'HTTP Request',
    'text-transform': 'Text Transform',
    'random': 'Random',
    'variable': 'Variable',
    // Avatar
    'avatar-display': 'Avatar Display',
    'emotion-analyzer': 'Emotion Analyzer',
    'lip-sync': 'Lip Sync',
  };
  return labels[type] || type;
}

function getNodeCategory(type: string): 'input' | 'process' | 'output' | 'control' {
  const categories: Record<string, 'input' | 'process' | 'output' | 'control'> = {
    // Control flow
    'start': 'control',
    'end': 'control',
    'loop': 'control',
    'foreach': 'control',
    // Input
    'manual-input': 'input',
    'youtube-chat': 'input',
    'twitch-chat': 'input',
    'timer': 'input',
    // Process
    'openai-llm': 'process',
    'anthropic-llm': 'process',
    'google-llm': 'process',
    'ollama-llm': 'process',
    'http-request': 'process',
    'text-transform': 'process',
    // Control
    'switch': 'control',
    'delay': 'control',
    'random': 'control',
    'variable': 'control',
    // Output
    'console-output': 'output',
    'voicevox-tts': 'output',
    'coeiroink-tts': 'output',
    'sbv2-tts': 'output',
    // Avatar
    'avatar-display': 'output',
    'emotion-analyzer': 'process',
    'lip-sync': 'process',
  };
  return categories[type] || 'process';
}

function getNodeInputs(type: string): { id: string; label: string }[] {
  const inputs: Record<string, { id: string; label: string }[]> = {
    // Control flow
    'start': [],
    'end': [{ id: 'input', label: 'Input' }],
    'loop': [
      { id: 'input', label: 'Input' },
      { id: 'loopback', label: 'Loop Back' },
    ],
    'foreach': [{ id: 'list', label: 'List' }],
    // Input
    'manual-input': [],
    'youtube-chat': [],
    'twitch-chat': [],
    'timer': [],
    // LLM
    'openai-llm': [{ id: 'prompt', label: 'Prompt' }],
    'anthropic-llm': [{ id: 'prompt', label: 'Prompt' }],
    'google-llm': [{ id: 'prompt', label: 'Prompt' }],
    'ollama-llm': [{ id: 'prompt', label: 'Prompt' }],
    // Control
    'switch': [
      { id: 'value', label: 'Value' },
      { id: 'data', label: 'Data' },
    ],
    'delay': [{ id: 'input', label: 'Input' }],
    // Output
    'console-output': [{ id: 'text', label: 'Text' }],
    'voicevox-tts': [{ id: 'text', label: 'Text' }],
    'coeiroink-tts': [{ id: 'text', label: 'Text' }],
    'sbv2-tts': [{ id: 'text', label: 'Text' }],
    // Utility
    'http-request': [{ id: 'body', label: 'Body' }],
    'text-transform': [{ id: 'text', label: 'Text' }],
    'random': [{ id: 'trigger', label: 'Trigger' }],
    'variable': [{ id: 'set', label: 'Set' }],
    // Avatar
    'avatar-display': [
      { id: 'text', label: 'Text' },
      { id: 'audio', label: 'Audio' },
    ],
    'emotion-analyzer': [{ id: 'text', label: 'Text' }],
    'lip-sync': [{ id: 'audio', label: 'Audio' }],
  };
  return inputs[type] || [];
}

function getNodeOutputs(type: string): { id: string; label: string }[] {
  const outputs: Record<string, { id: string; label: string }[]> = {
    // Control flow
    'start': [{ id: 'trigger', label: 'Trigger' }],
    'end': [],
    'loop': [
      { id: 'loop', label: 'Loop' },
      { id: 'done', label: 'Done' },
    ],
    'foreach': [
      { id: 'item', label: 'Item' },
      { id: 'index', label: 'Index' },
      { id: 'done', label: 'Done' },
    ],
    // Input
    'manual-input': [{ id: 'text', label: 'Text' }],
    'youtube-chat': [{ id: 'message', label: 'Message' }],
    'twitch-chat': [{ id: 'message', label: 'Message' }],
    'timer': [
      { id: 'tick', label: 'Tick' },
      { id: 'timestamp', label: 'Timestamp' },
    ],
    // LLM
    'openai-llm': [{ id: 'response', label: 'Response' }],
    'anthropic-llm': [{ id: 'response', label: 'Response' }],
    'google-llm': [{ id: 'response', label: 'Response' }],
    'ollama-llm': [{ id: 'response', label: 'Response' }],
    // Control
    'switch': [
      { id: 'true', label: 'True' },
      { id: 'false', label: 'False' },
    ],
    'delay': [{ id: 'output', label: 'Output' }],
    // Output
    'console-output': [],
    'voicevox-tts': [{ id: 'audio', label: 'Audio' }],
    'coeiroink-tts': [{ id: 'audio', label: 'Audio' }],
    'sbv2-tts': [{ id: 'audio', label: 'Audio' }],
    // Utility
    'http-request': [
      { id: 'response', label: 'Response' },
      { id: 'status', label: 'Status' },
    ],
    'text-transform': [{ id: 'result', label: 'Result' }],
    'random': [{ id: 'value', label: 'Value' }],
    'variable': [{ id: 'value', label: 'Value' }],
    // Avatar
    'avatar-display': [{ id: 'status', label: 'Status' }],
    'emotion-analyzer': [
      { id: 'expression', label: 'Expression' },
      { id: 'text', label: 'Text' },
    ],
    'lip-sync': [
      { id: 'mouth_values', label: 'Mouth' },
      { id: 'audio', label: 'Audio' },
    ],
  };
  return outputs[type] || [];
}
