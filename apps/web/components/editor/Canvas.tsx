'use client';

import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
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
import { usePluginStore } from '@/stores/pluginStore';
import { toast } from '@/stores/toastStore';
import CustomNode, { type CustomNodeData } from './CustomNode';
import FieldSelectorNode from './FieldSelectorNode';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import SearchPanel from './SearchPanel';
import { getNodeTypes, type SidebarNodeType, CATEGORY_COLORS, CATEGORY_LABELS } from './Sidebar';
import { type PluginCategory } from '@/lib/types';
import { type PortType, type PortDefinition, PORT_TYPE_COLORS, arePortTypesCompatible } from '@/lib/portTypes';
import { useUIPreferencesStore } from '@/stores/uiPreferencesStore';
import { type PromptSection } from '@/components/panels/NodeSettings';
import { useDragStateStore } from '@/stores/dragStateStore';

interface CanvasProps {
  onNodeSelect?: (nodeId: string | null) => void;
  onSave?: () => void;
  onRunWorkflow?: (startNodeId?: string) => void;
}

const reactFlowNodeTypes: NodeTypes = {
  custom: CustomNode,
  'field-selector': FieldSelectorNode,
};

// Default color for edges when plugin color is not found
const DEFAULT_EDGE_COLOR = '#10B981';

// Map plugin category to legacy category for CustomNodeData
function mapPluginCategoryToLegacy(category: string): 'input' | 'process' | 'output' | 'control' {
  switch (category) {
    case 'control':
      return 'control';
    case 'input':
      return 'input';
    case 'output':
    case 'tts':
    case 'avatar':
    case 'obs':
      return 'output';
    case 'llm':
    case 'utility':
    default:
      return 'process';
  }
}

interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  type: 'pane' | 'node' | 'edge';
  nodeId?: string;
  edgeId?: string;
}

// Canvas component - requires ReactFlowProvider to be provided by parent
export default function Canvas({ onNodeSelect, onSave, onRunWorkflow }: CanvasProps) {
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
    reachableNodeIds: reachableNodes,
    hasStartNode,
    nodeStatuses,
  } = useWorkflowStore();

  const { nodeDisplayMode, setNodeDisplayMode, searchVisible, searchQuery } = useUIPreferencesStore();
  const { getPluginColor, getPluginLabel, getPluginById, getPluginInputs, getPluginOutputs } = usePluginStore();
  const { setDragging, clearDragging } = useDragStateStore();

  // State for the "drop-on-canvas" compatible node suggestion panel
  const [connectSuggest, setConnectSuggest] = useState<{
    x: number; y: number;
    sourceType: PortType; sourceNodeId: string; sourcePortId: string;
  } | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      // Allow Ctrl+F even when typing in search input
      if (isCtrlOrCmd && event.key === 'f') {
        event.preventDefault();
        const { searchVisible: visible, setSearchVisible: setVisible } = useUIPreferencesStore.getState();
        setVisible(!visible);
        return;
      }

      // Ignore other shortcuts if typing in an input field
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

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

  // Reachable nodes are now computed in the Zustand store (workflowStore)

  // Check if any string value in a config object matches the search query
  const configMatchesQuery = useCallback(
    (config: Record<string, unknown> | undefined, query: string): boolean => {
      if (!config) return false;
      for (const value of Object.values(config)) {
        if (typeof value === 'string') {
          if (value.toLowerCase().includes(query)) return true;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          if (String(value).toLowerCase().includes(query)) return true;
        } else if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
              if (String(item).toLowerCase().includes(query)) return true;
            } else if (item !== null && typeof item === 'object') {
              if (configMatchesQuery(item as Record<string, unknown>, query)) return true;
            }
          }
        } else if (value && typeof value === 'object') {
          if (configMatchesQuery(value as Record<string, unknown>, query)) return true;
        }
      }
      return false;
    },
    []
  );

  // Compute search match node IDs
  const searchMatchIds = useMemo(() => {
    if (!searchVisible || !searchQuery.trim()) return new Set<string>();
    const query = searchQuery.toLowerCase();
    return new Set(
      workflowNodes
        .filter((node) => {
          const label = getPluginLabel(node.type).toLowerCase();
          return (
            label.includes(query) ||
            node.type.toLowerCase().includes(query) ||
            configMatchesQuery(node.config, query)
          );
        })
        .map((node) => node.id)
    );
  }, [searchVisible, searchQuery, workflowNodes, getPluginLabel, configMatchesQuery]);

  // Convert workflow nodes to React Flow nodes.
  // NOTE: intentionally independent of selection — selecting a node only changes
  // `selectedNodeId`, and re-running this expensive computation (plugin lookups +
  // dynamic port generation for every node) on each click was dropping a frame and
  // making the animated edges stutter. Selection is applied cheaply in `flowNodes`.
  const baseFlowNodes: Node[] = useMemo(
    () => {
      // Entry point node types (nodes with no inputs that can start execution)
      const entryPointTypes = new Set(['start', 'manual-input', 'youtube-chat', 'twitch-chat', 'timer']);

      // Convert port ID to display label (e.g., "text" -> "Text", "expression_id" -> "Expression ID")
      const formatPortLabel = (id: string): string => {
        return id
          .split(/[_-]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      };

      return workflowNodes.map((node) => {
        // Get inputs from plugin store or fall back to dynamic input logic
        const pluginInputs = getPluginInputs(node.type);
        let nodeInputs = pluginInputs.length > 0
          ? pluginInputs.map(p => ({ id: p.id, label: formatPortLabel(p.id), type: p.type as PortType }))
          : getNodeInputs(node.type, node.config);

        // Dynamic port generation based on manifest config field types
        const plugin = getPluginById(node.type);
        if (plugin?.config && node.config) {
          for (const [fieldKey, fieldDef] of Object.entries(plugin.config)) {
            if (fieldDef.type === 'prompt-builder' && Array.isArray(node.config[fieldKey])) {
              const sections = node.config[fieldKey] as PromptSection[];
              const inputSections = sections.filter(s => s.type === 'input' && s.content);
              if (inputSections.length > 0) {
                nodeInputs = inputSections.map(section => ({
                  id: section.content,
                  label: formatPortLabel(section.content),
                  type: 'string' as PortType,
                }));
              }
              break;
            }
            if (fieldDef.type === 'input-list' && Array.isArray(node.config[fieldKey])) {
              const inputs = (node.config[fieldKey] as string[]).filter(name => name);
              if (inputs.length > 0) {
                nodeInputs = inputs.map(name => ({
                  id: name,
                  label: formatPortLabel(name),
                  type: 'string' as PortType,
                }));
              }
              break;
            }
          }
        }

        // Get outputs from plugin store or fall back to static definitions
        const pluginOutputs = getPluginOutputs(node.type);
        const nodeOutputs = pluginOutputs.length > 0
          ? pluginOutputs.map(p => ({ id: p.id, label: formatPortLabel(p.id), type: p.type as PortType }))
          : getNodeOutputs(node.type);

        const isEntryPoint = entryPointTypes.has(node.type) || nodeInputs.length === 0;
        const isReachable = !hasStartNode || reachableNodes.has(node.id);

        // Use special node types for custom node components
        const reactFlowNodeType = node.type === 'field-selector' ? 'field-selector' : 'custom';

        // Get category from plugin or fall back to legacy function
        const category = plugin?.category
          ? mapPluginCategoryToLegacy(plugin.category)
          : getNodeCategory(node.type);

        return {
          id: node.id,
          type: reactFlowNodeType,
          position: node.position,
          data: {
            label: getPluginLabel(node.type),
            type: node.type,
            category,
            config: node.config,
            inputs: nodeInputs,
            outputs: nodeOutputs,
            isReachable,
            isEntryPoint,
            onPlayClick: () => onRunWorkflow?.(node.id),
            isSearchMatch: searchMatchIds.has(node.id),
            isSearchDimmed: searchMatchIds.size > 0 && !searchMatchIds.has(node.id),
          } as CustomNodeData,
          selected: false,
        };
      });
    },
    [workflowNodes, reachableNodes, hasStartNode, onRunWorkflow, getPluginLabel, getPluginById, getPluginInputs, getPluginOutputs, searchMatchIds]
  );

  // Apply selection in a cheap second pass. Unchanged nodes keep their object
  // identity, so only the (de)selected node re-renders — the rest of the graph
  // and its animated edges are left untouched, eliminating the click stutter.
  const flowNodes: Node[] = useMemo(() => {
    let changed = false;
    const next = baseFlowNodes.map((node) => {
      const selected = node.id === selectedNodeId;
      if (!!node.selected === selected) return node;
      changed = true;
      return { ...node, selected };
    });
    return changed ? next : baseFlowNodes;
  }, [baseFlowNodes, selectedNodeId]);

  // Convert workflow connections to React Flow edges with gradient style
  // Lines to/from unreachable nodes are dashed
  // Edge color/animation reflects source node execution status
  const flowEdges: Edge[] = useMemo(
    () =>
      connections.map((conn) => {
        const sourceNode = workflowNodes.find((n) => n.id === conn.from.nodeId);
        const baseEdgeColor = sourceNode ? (getPluginColor(sourceNode.type) || DEFAULT_EDGE_COLOR) : DEFAULT_EDGE_COLOR;

        // Check if this edge involves unreachable nodes (only when Start node exists)
        const sourceReachable = !hasStartNode || reachableNodes.has(conn.from.nodeId);
        const targetReachable = !hasStartNode || reachableNodes.has(conn.to.nodeId);
        const isReachableEdge = sourceReachable && targetReachable;

        // Status-based edge styling
        const sourceStatus = nodeStatuses[conn.from.nodeId]?.status;
        let edgeColor = baseEdgeColor;
        const animated = true;

        if (sourceStatus === 'error') {
          edgeColor = '#EF4444';
        } else if (sourceStatus === 'running') {
          edgeColor = '#3B82F6';
        } else if (sourceStatus === 'completed') {
          edgeColor = '#10B981';
        }

        return {
          id: conn.id,
          source: conn.from.nodeId,
          sourceHandle: conn.from.port,
          target: conn.to.nodeId,
          targetHandle: conn.to.port,
          animated,
          style: {
            stroke: edgeColor,
            strokeWidth: 3,
            strokeDasharray: isReachableEdge ? undefined : '8 4', // Dashed for unreachable
            filter: `drop-shadow(0 0 4px ${edgeColor}50)`,
          },
        };
      }),
    [connections, workflowNodes, reachableNodes, hasStartNode, getPluginColor, nodeStatuses]
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
          toast.success('ノードを削除しました');
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
      setConnectSuggest(null);
    },
    [addConnection]
  );

  // When dragging starts from a handle — notify drag state store so all nodes can highlight/dim
  const onConnectStart = useCallback(
    (_event: unknown, params: { nodeId?: string | null; handleId?: string | null; handleType?: 'source' | 'target' | null }) => {
      const { nodeId, handleId, handleType } = params;
      if (!nodeId || !handleId || !handleType) return;
      const node = workflowNodes.find((n) => n.id === nodeId);
      if (!node) return;
      const portDefs = handleType === 'source' ? getPluginOutputs(node.type) : getPluginInputs(node.type);
      const portDef = portDefs.find((p) => p.id === handleId);
      if (portDef) {
        setDragging(portDef.type as PortType, handleType);
      }
    },
    [workflowNodes, getPluginInputs, getPluginOutputs, setDragging]
  ) as Parameters<typeof ReactFlow>[0]['onConnectStart'];

  // When dragging ends — clear drag state, show suggestion panel if dropped on empty canvas
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // Reconnecting an existing edge also fires connect events — don't show the
      // "connectable nodes" suggestion panel when the user is just dragging an
      // edge end and releasing it on the canvas.
      if (isReconnecting.current) {
        clearDragging();
        return;
      }
      const state = useDragStateStore.getState();
      const target = event.target as HTMLElement;
      const isOnHandle = target.classList.contains('react-flow__handle');
      const isOnNode = !!target.closest('.react-flow__node');
      if (!isOnHandle && !isOnNode && state.draggingSourceType) {
        const clientX = (event as MouseEvent).clientX ?? (event as TouchEvent).changedTouches?.[0]?.clientX;
        const clientY = (event as MouseEvent).clientY ?? (event as TouchEvent).changedTouches?.[0]?.clientY;
        if (clientX !== undefined && clientY !== undefined) {
          setConnectSuggest({
            x: clientX,
            y: clientY,
            sourceType: state.draggingSourceType,
            sourceNodeId: '',
            sourcePortId: '',
          });
        }
      }
      clearDragging();
    },
    [clearDragging]
  );

  /** Only allow connections where port types are compatible. */
  const isValidConnection = useCallback(
    (connection: { source?: string | null; target?: string | null; sourceHandle?: string | null; targetHandle?: string | null }) => {
      const srcNode = workflowNodes.find((n) => n.id === connection.source);
      const tgtNode = workflowNodes.find((n) => n.id === connection.target);
      if (!srcNode || !tgtNode || !connection.sourceHandle || !connection.targetHandle) return true;
      const srcPort = getPluginOutputs(srcNode.type).find((p) => p.id === connection.sourceHandle);
      const tgtPort = getPluginInputs(tgtNode.type).find((p) => p.id === connection.targetHandle);
      if (!srcPort || !tgtPort) return true; // unknown port — allow
      return arePortTypesCompatible(srcPort.type as PortType, tgtPort.type as PortType);
    },
    [workflowNodes, getPluginInputs, getPluginOutputs]
  ) as Parameters<typeof ReactFlow>[0]['isValidConnection'];

  // Track if edge was successfully reconnected
  const edgeReconnectSuccessful = useRef(true);
  // True while an existing edge's end is being dragged (reconnect). Used to
  // suppress the "connectable nodes" suggestion panel on reconnect drops, since
  // reconnecting also fires the connect-start/end events.
  const isReconnecting = useRef(false);

  // Called when edge reconnection starts
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
    isReconnecting.current = true;
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
      isReconnecting.current = false;
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
    setConnectSuggest(null);
  }, [selectNode, onNodeSelect]);

  // Dismiss the connect-suggest panel with the Escape key
  useEffect(() => {
    if (!connectSuggest) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConnectSuggest(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connectSuggest]);

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

    // Pane context menu — "Add Node ▶" with category flyout submenu
    const nodeTypesList = getNodeTypes();
    const { plugins } = usePluginStore.getState();

    // Group node types by category
    const byCategory: Record<string, SidebarNodeType[]> = {};
    for (const nt of nodeTypesList) {
      const plugin = plugins.find((p) => p.id === nt.id);
      const cat = plugin?.category ?? 'utility';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(nt);
    }

    const categoryOrder: PluginCategory[] = [
      'control', 'input', 'llm', 'tts', 'avatar', 'output', 'utility', 'obs',
    ];

    const submenuSections = categoryOrder
      .filter((cat) => byCategory[cat]?.length > 0)
      .map((cat) => ({
        categoryId: cat,
        label: CATEGORY_LABELS[cat] ?? cat,
        color: CATEGORY_COLORS[cat] ?? '#6B7280',
        items: (byCategory[cat] ?? []).map((nodeType) => ({
          label: nodeType.label,
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
        })),
      }));

    return [
      {
        label: 'ノードを追加',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        ),
        submenuSections,
      },
    ];
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
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onReconnectStart={onReconnectStart}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        reconnectRadius={20}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={reactFlowNodeTypes}
        fitView
        className="!bg-transparent"
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: DEFAULT_EDGE_COLOR, strokeWidth: 3 },
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
          className="!bg-gray-800/90 !border-white/20 !rounded-lg !shadow-lg !hidden"
          showZoom={true}
          showFitView={true}
          showInteractive={true}
        />
      </ReactFlow>

      {/* Search Panel */}
      <SearchPanel />

      {/* Connect-suggest panel: shown when dragging a wire onto empty canvas */}
      {connectSuggest && (() => {
        const { plugins } = usePluginStore.getState();
        const nodeTypesList = getNodeTypes();
        const compatible = nodeTypesList.filter((nt) => {
          const plugin = plugins.find((p) => p.id === nt.id);
          if (!plugin) return false;
          const inputs = plugin.node?.inputs ?? [];
          return inputs.some((inp) => arePortTypesCompatible(connectSuggest.sourceType, inp.type as PortType));
        });
        if (compatible.length === 0) return null;
        const adjust = (v: number, max: number, size: number) => Math.min(v, max - size);
        const px = adjust(connectSuggest.x, window.innerWidth, 220);
        const py = adjust(connectSuggest.y, window.innerHeight, compatible.length * 36 + 48);
        return (
          <div
            className="fixed z-50 py-1 rounded-lg shadow-xl"
            style={{ left: px, top: py, background: 'rgba(17,24,39,0.98)', border: '1px solid rgba(255,255,255,0.1)', minWidth: '210px' }}
          >
            <div className="px-3 pt-2 pb-1 text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: PORT_TYPE_COLORS[connectSuggest.sourceType] }} />
              接続できるノード
            </div>
            {compatible.map((nt) => (
              <button
                key={nt.id}
                onClick={() => {
                  const bounds = reactFlowWrapper.current?.getBoundingClientRect();
                  if (!bounds) return;
                  addNode({ type: nt.id, position: { x: connectSuggest.x - bounds.left - 80, y: connectSuggest.y - bounds.top - 30 }, config: { ...nt.defaultConfig } });
                  setConnectSuggest(null);
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-white/90 hover:bg-white/10 transition-colors"
              >
                <span style={{ color: nt.color }}>{nt.icon}</span>
                {nt.label}
              </button>
            ))}
            <button onClick={() => setConnectSuggest(null)} className="w-full px-3 py-1.5 text-left text-[11px] text-white/30 hover:text-white/60 border-t border-white/10 mt-1">キャンセル</button>
          </div>
        );
      })()}

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
          display: none !important;
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

// Legacy helper functions for fallback when plugin data is not available
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

function getNodeInputs(type: string, _config?: Record<string, unknown>): PortDefinition[] {
  // Dynamic port generation (prompt-builder, input-list) is now handled
  // generically in the flowNodes useMemo via manifest config field types.
  // This function only provides static fallback definitions.

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
      { id: 'motionUrl', label: 'Motion URL', type: 'string' },
      { id: 'motion', label: 'Motion', type: 'string' },
      { id: 'passthrough', label: 'Passthrough', type: 'any' },
    ],
    'lip-sync': [
      { id: 'mouthValues', label: 'Mouth', type: 'array' },
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
