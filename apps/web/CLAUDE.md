# AITuberFlow Frontend (apps/web)

## Overview

Next.js 16 frontend with React Flow for visual workflow editing, Three.js/VRM for avatar rendering, and Zustand for state management.

## Directory Structure

```
apps/web/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Home page (redirect to editor)
│   ├── globals.css          # Global styles
│   ├── (editor)/            # Editor route group
│   │   ├── editor/[id]/     # /editor/{workflowId}
│   │   └── preview/[id]/    # /preview/{workflowId}
│   └── (overlay)/           # Overlay route group
│       └── overlay/[id]/    # /overlay/{workflowId} (OBS browser source)
├── components/
│   ├── editor/              # Workflow editor components
│   │   ├── Canvas.tsx       # React Flow canvas + node metadata
│   │   ├── Sidebar.tsx      # Node palette (drag to add)
│   │   ├── CustomNode.tsx   # Node rendering (icons, colors, ports)
│   │   ├── ContextMenu.tsx  # Right-click menu
│   │   └── Header.tsx       # Top bar (save, settings)
│   ├── avatar/              # Avatar components
│   │   ├── AvatarView.tsx   # Avatar container
│   │   └── VRMRenderer.tsx  # Three.js VRM rendering
│   └── panels/              # Side panels
│       ├── NodeSettings.tsx # Node configuration form
│       ├── LogPanel.tsx     # Execution logs
│       └── ExpressionPresets.tsx
├── stores/                   # Zustand state management
│   ├── workflowStore.ts     # Workflow state (nodes, connections, execution)
│   ├── localeStore.ts       # i18n language setting
│   └── uiPreferencesStore.ts # UI preferences (panel sizes, etc.)
├── hooks/
│   └── useWebSocket.ts      # Socket.IO connection hook
├── lib/
│   ├── api.ts              # REST API client functions
│   ├── types.ts            # TypeScript type definitions
│   ├── portTypes.ts        # Node port type definitions
│   ├── i18n.ts             # Internationalization
│   └── constants.ts        # Constants
└── public/                  # Static assets
```

## Key Components

### Canvas.tsx
- React Flow canvas for node graph
- `nodeTypeMap` - Defines all node types with inputs/outputs/colors
- Handles connections, drag-drop, selection
- Double-click node to configure

### Sidebar.tsx
- Node palette organized by category
- Drag nodes onto canvas to add
- Categories: Input, Output, Process, Control, Avatar, LLM, TTS

### CustomNode.tsx
- Renders individual nodes
- Icon, label, input/output handles
- Status indicators (running, completed, error)
- Category-based color coding

### NodeSettings.tsx
- Configuration panel for selected node
- Auto-generates form from manifest config schema
- Support for: string, number, boolean, select, textarea

## State Management (Zustand)

### workflowStore.ts
```typescript
// Key state
workflowId: string | null
nodes: WorkflowNode[]
connections: Connection[]
selectedNodeId: string | null
isExecuting: boolean
logs: ExecutionLog[]
nodeStatuses: Record<string, NodeStatus>

// Key actions
addNode(node) → nodeId
updateNode(id, updates)
removeNode(id)
addConnection(conn)
loadWorkflow(data)
undo() / redo()
```

### Usage
```typescript
import { useWorkflowStore } from '@/stores/workflowStore';

function MyComponent() {
  const { nodes, addNode, selectedNodeId } = useWorkflowStore();
  // ...
}
```

## Adding a New Node Type

### 1. Update Canvas.tsx - nodeTypeMap
```typescript
const nodeTypeMap: Record<string, NodeTypeMetadata> = {
  'my-node': {
    label: 'My Node',
    category: 'process',
    color: '#10b981',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Output', type: 'string' }],
  },
  // ...
};
```

### 2. Update Sidebar.tsx - Add to category
```typescript
const nodeCategories = {
  process: [
    // ...existing nodes
    { type: 'my-node', label: 'My Node' },
  ],
};
```

### 3. Update CustomNode.tsx - Add icon (optional)
```typescript
const nodeIcons: Record<string, React.ReactNode> = {
  'my-node': <MyIcon className="w-4 h-4" />,
  // ...
};
```

## WebSocket Communication

### useWebSocket Hook
```typescript
const { isConnected, joinWorkflow, leaveWorkflow } = useWebSocket(workflowId);
```

### Events Received
- `log` - Node log messages
- `node.status` - Node execution status
- `audio` - Audio file ready for playback
- `avatar.expression` - Expression change
- `avatar.mouth` - Lip sync value
- `subtitle` - Subtitle text

## Pages

### /editor/[id]
Main workflow editor with:
- Canvas (center)
- Sidebar (left)
- Node settings panel (right)
- Log panel (bottom)
- Avatar preview (top-right)

### /overlay/[id]
OBS browser source overlay with:
- Avatar display
- Subtitles
- Audio playback
- Transparent background

URL parameters:
- `model` - VRM model URL
- `subtitle=true` - Enable subtitles
- `subPosition=bottom|top`
- `subFontSize=24`
- `volume=0.8`
- `debug=true`

## API Client (lib/api.ts)

```typescript
// Workflows
fetchWorkflows()
fetchWorkflow(id)
createWorkflow(data)
updateWorkflow(id, data)
deleteWorkflow(id)
startWorkflow(id, nodeId)
stopWorkflow(id)

// Plugins
fetchPlugins()

// Templates
fetchTemplates()
```

## Styling

- Tailwind CSS for utility classes
- CSS modules in `app/` for page-specific styles
- Dark theme default
- Color scheme follows node categories

## Running

```bash
npm install
npm run dev     # Development (port 3000)
npm run build   # Production build
npm run start   # Production server
```

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8001
NEXT_PUBLIC_WS_URL=http://localhost:8001
```

## Key Dependencies

- `next@16.1.3` - React framework
- `react@18.3.1` - UI library
- `@xyflow/react@12.0.0` - Node graph editor
- `zustand@4.5.0` - State management
- `socket.io-client@4.7.4` - WebSocket client
- `three@0.182.0` - 3D rendering
- `@pixiv/three-vrm@3.4.5` - VRM avatar loading
- `tailwindcss` - Styling

## TypeScript Types (lib/types.ts)

```typescript
interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { config: Record<string, any> };
}

interface Connection {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

interface ExecutionLog {
  id: string;
  nodeId: string;
  message: string;
  level: 'info' | 'warn' | 'error';
  timestamp: string;
}
```
