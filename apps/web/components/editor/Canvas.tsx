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
  ConnectionMode,
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
import FieldSelectorNode from './FieldSelectorNode';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import DataPreviewPopup from './DataPreviewPopup';
import { nodeTypes as sidebarNodeTypes, type SidebarNodeType } from './Sidebar';
import { type PortType, type PortDefinition } from '@/lib/portTypes';
import { useUIPreferencesStore, type NodeDisplayMode } from '@/stores/uiPreferencesStore';
import { type PromptSection } from '@/components/panels/NodeSettings';

interface CanvasProps {
  onNodeSelect?: (nodeId: string | null) => void;
  onSave?: () => void;
  onRunWorkflow?: (startNodeId?: string) => void;
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
  'field-selector': FieldSelectorNode,
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
  'discord-chat': '#5865F2',
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
  'donation-alert': '#F59E0B',
  // Control
  'switch': '#F97316',
  'delay': '#F97316',
  // Utility
  'http-request': '#3B82F6',
  'text-transform': '#EC4899',
  'field-selector': '#8B5CF6',
  'random': '#8B5CF6',
  'variable': '#14B8A6',
  // Avatar
  'avatar-configuration': '#E879F9',
  'emotion-analyzer': '#F472B6',
  'motion-trigger': '#C084FC',
  'lip-sync': '#FB7185',
  'subtitle-display': '#A855F7',
  'audio-player': '#8B5CF6',
};

interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  type: 'pane' | 'node' | 'edge';
  nodeId?: string;
  edgeId?: string;
}

interface DataPreviewState {
  show: boolean;
  x: number;
  y: number;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
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
  const [dataPreview, setDataPreview] = useState<DataPreviewState | null>(null);

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
    nodeStatuses,
  } = useWorkflowStore();

  const { nodeDisplayMode, setNodeDisplayMode } = useUIPreferencesStore();

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
        const nodeInputs = getNodeInputs(node.type, node.config);
        const isEntryPoint = entryPointTypes.has(node.type) || nodeInputs.length === 0;
        const isReachable = !hasStartNode || reachableNodes.has(node.id);

        // Use special node types for custom node components
        const reactFlowNodeType = node.type === 'field-selector' ? 'field-selector' : 'custom';

        return {
          id: node.id,
          type: reactFlowNodeType,
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
            onPlayClick: () => onRunWorkflow?.(node.id),
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
    setDataPreview(null);
  }, [selectNode, onNodeSelect]);

  // Handle edge click to show data preview
  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      setDataPreview({
        show: true,
        x: event.clientX,
        y: event.clientY,
        edgeId: edge.id,
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
      });
    },
    []
  );

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
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        fitView
        className="!bg-transparent"
        connectionMode={ConnectionMode.Loose}
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

      {/* Display Mode Toggle */}
      <div className="absolute top-4 right-4 flex gap-1 bg-gray-800/95 rounded-lg p-1 border border-white/10 shadow-lg z-10">
        <span className="px-2 py-1.5 text-[10px] text-white/40">表示:</span>
        {(['simple', 'standard', 'detailed'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setNodeDisplayMode(mode)}
            className={`px-3 py-1.5 text-[11px] rounded transition-colors ${
              nodeDisplayMode === mode
                ? 'bg-white/20 text-white font-medium'
                : 'text-white/60 hover:bg-white/10 hover:text-white/80'
            }`}
          >
            {mode === 'simple' ? '簡易' : mode === 'standard' ? '標準' : '詳細'}
          </button>
        ))}
      </div>

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

      {/* Data Preview Popup */}
      {dataPreview && (() => {
        const connection = connections.find((c) => c.id === dataPreview.edgeId);
        const sourceNode = workflowNodes.find((n) => n.id === dataPreview.sourceNodeId);
        const targetNode = workflowNodes.find((n) => n.id === dataPreview.targetNodeId);
        return (
          <DataPreviewPopup
            x={dataPreview.x}
            y={dataPreview.y}
            sourceNodeLabel={getNodeLabel(sourceNode?.type || '')}
            sourceNodeType={sourceNode?.type || ''}
            targetNodeLabel={getNodeLabel(targetNode?.type || '')}
            data={nodeStatuses[dataPreview.sourceNodeId]?.data?.outputs}
            selectedFields={connection?.from.fieldPaths || []}
            onFieldsChange={(fieldPaths) => {
              if (connection) {
                updateConnection(connection.id, {
                  from: { ...connection.from, fieldPaths },
                });
              }
            }}
            onClose={() => setDataPreview(null)}
          />
        );
      })()}
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
    'discord-chat': 'Discord Chat',
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
    'donation-alert': 'Donation Alert',
    'voicevox-tts': 'VOICEVOX',
    'coeiroink-tts': 'COEIROINK',
    'sbv2-tts': 'Style-Bert-VITS2',
    // Utility
    'http-request': 'HTTP Request',
    'text-transform': 'Text Transform',
    'field-selector': 'Field Selector',
    'random': 'Random',
    'variable': 'Variable',
    // Avatar
    'avatar-configuration': 'Avatar Config',
    'emotion-analyzer': 'Emotion Analyzer',
    'motion-trigger': 'Motion Trigger',
    'lip-sync': 'Lip Sync',
    'subtitle-display': 'Subtitle Display',
    'audio-player': 'Audio Player',
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
    'discord-chat': 'input',
    'timer': 'input',
    // Process
    'openai-llm': 'process',
    'anthropic-llm': 'process',
    'google-llm': 'process',
    'ollama-llm': 'process',
    'http-request': 'process',
    'text-transform': 'process',
    'field-selector': 'process',
    // Control
    'switch': 'control',
    'delay': 'control',
    'random': 'control',
    'variable': 'control',
    // Output
    'console-output': 'output',
    'donation-alert': 'output',
    'voicevox-tts': 'output',
    'coeiroink-tts': 'output',
    'sbv2-tts': 'output',
    // Avatar
    'avatar-configuration': 'output',
    'emotion-analyzer': 'process',
    'motion-trigger': 'process',
    'lip-sync': 'process',
    'subtitle-display': 'output',
    'audio-player': 'output',
  };
  return categories[type] || 'process';
}

function getNodeInputs(type: string, config?: Record<string, unknown>): PortDefinition[] {
  // For LLM nodes with prompt builder, generate dynamic inputs from promptSections
  if (type === 'openai-llm' && config?.promptSections) {
    const sections = config.promptSections as PromptSection[];
    const inputSections = sections.filter(s => s.type === 'input');
    if (inputSections.length > 0) {
      // Generate dynamic input ports from prompt sections
      return inputSections.map(section => ({
        id: section.content, // The input port name
        label: section.content.replace(/_/g, ' '), // Convert underscores to spaces for display
        type: 'string' as PortType,
      }));
    }
    // If promptSections exists but has no inputs, still use default prompt
    return [{ id: 'prompt', label: 'Prompt', type: 'string' }];
  }

  // For text-transform with templateInputs, generate dynamic inputs
  if (type === 'text-transform' && config?.templateInputs) {
    const templateInputs = config.templateInputs as string[];
    if (templateInputs.length > 0) {
      return templateInputs.map(inputName => ({
        id: inputName,
        label: inputName.replace(/_/g, ' '),
        type: 'string' as PortType,
      }));
    }
    // Fall back to default text input
    return [{ id: 'text', label: 'Text', type: 'string' }];
  }

  const inputs: Record<string, PortDefinition[]> = {
    // Control flow
    'start': [],
    'end': [{ id: 'input', label: 'Input', type: 'any' }],
    'loop': [
      { id: 'input', label: 'Input', type: 'any' },
      { id: 'loopback', label: 'Loop Back', type: 'any' },
    ],
    'foreach': [{ id: 'list', label: 'List', type: 'array' }],
    // Input
    'manual-input': [],
    'youtube-chat': [],
    'twitch-chat': [],
    'discord-chat': [],
    'timer': [],
    // LLM
    'openai-llm': [{ id: 'prompt', label: 'Prompt', type: 'string' }],
    'anthropic-llm': [{ id: 'prompt', label: 'Prompt', type: 'string' }],
    'google-llm': [{ id: 'prompt', label: 'Prompt', type: 'string' }],
    'ollama-llm': [{ id: 'prompt', label: 'Prompt', type: 'string' }],
    // Control
    'switch': [
      { id: 'value', label: 'Value', type: 'any' },
      { id: 'data', label: 'Data', type: 'any' },
    ],
    'delay': [{ id: 'input', label: 'Input', type: 'any' }],
    // Output
    'console-output': [{ id: 'text', label: 'Text', type: 'string' }],
    'donation-alert': [
      { id: 'trigger', label: 'Trigger', type: 'any' },
      { id: 'amount', label: 'Amount', type: 'number' },
      { id: 'currency', label: 'Currency', type: 'string' },
      { id: 'author', label: 'Author', type: 'string' },
      { id: 'message', label: 'Message', type: 'string' },
    ],
    'voicevox-tts': [{ id: 'text', label: 'Text', type: 'string' }],
    'coeiroink-tts': [{ id: 'text', label: 'Text', type: 'string' }],
    'sbv2-tts': [{ id: 'text', label: 'Text', type: 'string' }],
    // Utility
    'http-request': [{ id: 'body', label: 'Body', type: 'object' }],
    'text-transform': [{ id: 'text', label: 'Text', type: 'string' }],
    'field-selector': [{ id: 'input', label: 'Input', type: 'object' }],
    'random': [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    'variable': [{ id: 'set', label: 'Set', type: 'any' }],
    // Avatar
    'avatar-configuration': [],
    'emotion-analyzer': [{ id: 'text', label: 'Text', type: 'string' }],
    'motion-trigger': [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    'lip-sync': [
      { id: 'audio', label: 'Audio', type: 'audio' },
    ],
    'subtitle-display': [{ id: 'text', label: 'Text', type: 'string' }],
    'audio-player': [
      { id: 'audio', label: 'Audio', type: 'audio' },
      { id: 'duration', label: 'Duration', type: 'number' },
    ],
  };
  return inputs[type] || [];
}

function getNodeOutputs(type: string): PortDefinition[] {
  const outputs: Record<string, PortDefinition[]> = {
    // Control flow
    'start': [{ id: 'trigger', label: 'Trigger', type: 'any' }],
    'end': [],
    'loop': [
      { id: 'loop', label: 'Loop', type: 'any' },
      { id: 'done', label: 'Done', type: 'boolean' },
    ],
    'foreach': [
      { id: 'item', label: 'Item', type: 'any' },
      { id: 'index', label: 'Index', type: 'number' },
      { id: 'done', label: 'Done', type: 'boolean' },
    ],
    // Input
    'manual-input': [{ id: 'text', label: 'Text', type: 'string' }],
    'youtube-chat': [
      { id: 'text', label: 'Text', type: 'string' },
      { id: 'author', label: 'Author', type: 'string' },
      { id: 'message', label: 'Full Data', type: 'object' },
    ],
    'twitch-chat': [
      { id: 'text', label: 'Text', type: 'string' },
      { id: 'author', label: 'Author', type: 'string' },
      { id: 'message', label: 'Full Data', type: 'object' },
    ],
    'discord-chat': [
      { id: 'text', label: 'Text', type: 'string' },
      { id: 'author', label: 'Author', type: 'string' },
      { id: 'message', label: 'Full Data', type: 'object' },
    ],
    'timer': [
      { id: 'tick', label: 'Tick', type: 'number' },
      { id: 'timestamp', label: 'Timestamp', type: 'string' },
    ],
    // LLM
    'openai-llm': [{ id: 'response', label: 'Response', type: 'string' }],
    'anthropic-llm': [{ id: 'response', label: 'Response', type: 'string' }],
    'google-llm': [{ id: 'response', label: 'Response', type: 'string' }],
    'ollama-llm': [{ id: 'response', label: 'Response', type: 'string' }],
    // Control
    'switch': [
      { id: 'true', label: 'True', type: 'any' },
      { id: 'false', label: 'False', type: 'any' },
    ],
    'delay': [{ id: 'output', label: 'Output', type: 'any' }],
    // Output
    'console-output': [],
    'donation-alert': [{ id: 'displayed', label: 'Displayed', type: 'boolean' }],
    'voicevox-tts': [{ id: 'audio', label: 'Audio', type: 'audio' }],
    'coeiroink-tts': [{ id: 'audio', label: 'Audio', type: 'audio' }],
    'sbv2-tts': [{ id: 'audio', label: 'Audio', type: 'audio' }],
    // Utility
    'http-request': [
      { id: 'response', label: 'Response', type: 'object' },
      { id: 'status', label: 'Status', type: 'number' },
    ],
    'text-transform': [{ id: 'result', label: 'Result', type: 'string' }],
    'field-selector': [{ id: 'output', label: 'Output', type: 'any' }],
    'random': [{ id: 'value', label: 'Value', type: 'number' }],
    'variable': [{ id: 'value', label: 'Value', type: 'any' }],
    // Avatar
    'avatar-configuration': [],
    'emotion-analyzer': [
      { id: 'expression', label: 'Expression', type: 'string' },
      { id: 'intensity', label: 'Intensity', type: 'number' },
      { id: 'text', label: 'Text', type: 'string' },
    ],
    'motion-trigger': [
      { id: 'expression', label: 'Expression', type: 'string' },
      { id: 'intensity', label: 'Intensity', type: 'number' },
      { id: 'motion_url', label: 'Motion URL', type: 'string' },
      { id: 'motion', label: 'Motion', type: 'string' },
      { id: 'passthrough', label: 'Passthrough', type: 'any' },
    ],
    'lip-sync': [
      { id: 'mouth_values', label: 'Mouth', type: 'array' },
      { id: 'duration', label: 'Duration', type: 'number' },
      { id: 'audio', label: 'Audio', type: 'audio' },
    ],
    'subtitle-display': [{ id: 'text', label: 'Text', type: 'string' }],
    'audio-player': [
      { id: 'audio', label: 'Audio', type: 'audio' },
      { id: 'duration', label: 'Duration', type: 'number' },
    ],
  };
  return outputs[type] || [];
}
