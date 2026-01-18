# AITuberFlow - Technical Specification

## 1. Overview

### 1.1 Project Summary
AITuberFlow is a visual workflow editor for building AI-powered virtual streamers. Users connect nodes to create custom AITuber pipelines without coding.

### 1.2 Core Value Proposition
- **Event-driven architecture**: React to superchats, silence, keywords differently
- **Plugin ecosystem**: Community-contributed nodes and templates
- **Character state management**: Emotion, memory, personality flow through all nodes

### 1.3 Target Users
1. Developers who want customizable AITuber systems
2. Creators who want to build AITubers without deep coding
3. VTuber agencies who need to manage multiple AI characters

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Workflow Editor │  │  Node Settings  │  │  Execution Log  │  │
│  │  (React Flow)    │  │  Panel          │  │  Panel          │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │ WebSocket + REST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI)                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Workflow Engine │  │  Event Bus      │  │  Plugin Loader  │  │
│  │                 │  │                 │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Character State │  │  Stream Context │  │  Node Registry  │  │
│  │ Manager         │  │  Manager        │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Plugins  │   │ Database │   │ External │
        │ (Nodes)  │   │ (SQLite) │   │ APIs     │
        └──────────┘   └──────────┘   └──────────┘
```

### 2.2 Tech Stack

| Layer | Technology | Reason |
|-------|------------|--------|
| Frontend | Next.js 14 + React 18 | SSR, App Router |
| Workflow UI | React Flow | Best node editor library |
| Styling | Tailwind CSS | Rapid development |
| Backend | FastAPI (Python) | Async, LLM ecosystem compatibility |
| Database | SQLite (dev) / PostgreSQL (prod) | Simple start, scalable later |
| Realtime | WebSocket | Live execution logs, node status |
| Plugin Runtime | Python | Easy for AI/ML integrations |

---

## 3. Data Models

### 3.1 Workflow

```typescript
interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: Node[];
  connections: Connection[];
  character: CharacterConfig;
  createdAt: string;
  updatedAt: string;
}
```

### 3.2 Node

```typescript
interface Node {
  id: string;
  type: string;           // Plugin ID (e.g., "youtube-chat", "openai-llm")
  position: { x: number; y: number };
  config: Record<string, any>;  // Node-specific settings
  eventFilters?: EventFilter[]; // Which events trigger this node
}

interface EventFilter {
  event: string;          // e.g., "message.superchat"
  condition?: string;     // Optional: JS expression for filtering
}
```

### 3.3 Connection

```typescript
interface Connection {
  id: string;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
}
```

### 3.4 Character State

```typescript
interface CharacterState {
  name: string;
  personality: string;
  
  // Dynamic state (updated during execution)
  emotion: {
    current: string;      // "happy", "sad", "excited", etc.
    intensity: number;    // 0.0 - 1.0
  };
  
  memory: {
    shortTerm: Message[]; // Recent conversation (last N messages)
    longTerm: Memory[];   // Persistent memories (RAG or summary)
  };
  
  // Metadata
  currentTopic?: string;
  lastSpokeAt?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  author?: string;        // Viewer name
  timestamp: string;
  metadata?: {
    superchat?: number;
    isMember?: boolean;
  };
}
```

### 3.5 Stream Context

```typescript
interface StreamContext {
  platform: "youtube" | "twitch" | "discord" | null;
  videoId?: string;
  channelId?: string;
  
  // Live stats
  viewerCount: number;
  likeCount: number;
  
  // Queues
  messageQueue: Message[];
  superchatQueue: Message[];
  
  // Timing
  streamStartedAt?: string;
  lastMessageAt?: string;
  silenceDuration: number;  // Seconds since last message
}
```

---

## 4. Event System

### 4.1 Event Types

```yaml
# Input events (from external sources)
message.received:
  payload: { message: Message }
  
message.superchat:
  payload: { message: Message, amount: number, currency: string }
  
message.membership:
  payload: { message: Message, tier: string }

viewer.joined:
  payload: { count: number, delta: number }

viewer.left:
  payload: { count: number, delta: number }

# Internal events (from nodes)
emotion.changed:
  payload: { previous: string, current: string, intensity: number }

response.generated:
  payload: { text: string, nodeId: string }

audio.generated:
  payload: { audioUrl: string, duration: number }

# Trigger events (time-based)
trigger.timer:
  payload: { intervalMs: number }

trigger.silence:
  payload: { durationSeconds: number }

# System events
workflow.started:
  payload: { workflowId: string }

workflow.stopped:
  payload: { workflowId: string, reason: string }

node.error:
  payload: { nodeId: string, error: string }
```

### 4.2 Event Flow

```
1. Event Source (YouTube API, Timer, etc.)
         │
         ▼
2. Event Bus receives event
         │
         ▼
3. Find nodes listening to this event type
         │
         ▼
4. For each matching node:
   a. Check eventFilters conditions
   b. If pass, execute node with event payload
   c. Node may emit new events
         │
         ▼
5. Follow connections to downstream nodes
         │
         ▼
6. Repeat until no more nodes to execute
```

### 4.3 Event Filtering Example

```json
{
  "id": "superchat-handler",
  "type": "openai-llm",
  "eventFilters": [
    {
      "event": "message.superchat",
      "condition": "event.amount >= 500"
    }
  ],
  "config": {
    "systemPrompt": "You received a superchat! Be extra grateful."
  }
}
```

---

## 5. Plugin System

### 5.1 Plugin Structure

```
/plugins
  /youtube-chat
    manifest.json       # Plugin metadata
    node.py             # Main logic
    icon.svg            # 24x24 icon
    README.md           # Documentation
```

### 5.2 Manifest Schema

```json
{
  "$schema": "https://aituber-flow.dev/schemas/plugin-manifest.json",
  "id": "youtube-chat",
  "name": "YouTube Chat",
  "version": "1.0.0",
  "description": "Fetch live chat messages from YouTube streams",
  "author": {
    "name": "AITuberFlow Team",
    "url": "https://github.com/aituber-flow"
  },
  "license": "MIT",
  "category": "input",
  
  "node": {
    "inputs": [],
    "outputs": [
      {
        "id": "message",
        "type": "Message",
        "description": "Chat message object"
      }
    ],
    "events": {
      "emits": ["message.received", "message.superchat", "message.membership"],
      "listens": []
    }
  },
  
  "config": {
    "videoId": {
      "type": "string",
      "label": "Video ID",
      "description": "YouTube video ID or URL",
      "required": true
    },
    "pollInterval": {
      "type": "number",
      "label": "Poll Interval (ms)",
      "default": 3000,
      "min": 1000,
      "max": 10000
    },
    "filterBots": {
      "type": "boolean",
      "label": "Filter Bot Messages",
      "default": true
    }
  },
  
  "dependencies": {
    "python": ["google-api-python-client>=2.0.0"]
  }
}
```

### 5.3 Node Implementation

```python
# plugins/youtube-chat/node.py

from aituber_flow_sdk import BaseNode, NodeContext, Event

class YouTubeChatNode(BaseNode):
    """Fetches live chat messages from YouTube."""
    
    async def setup(self, config: dict, context: NodeContext):
        """Called once when workflow starts."""
        self.video_id = config["videoId"]
        self.poll_interval = config.get("pollInterval", 3000)
        self.filter_bots = config.get("filterBots", True)
        
        # Initialize YouTube API client
        self.client = await self._create_client()
        self.chat_id = await self._get_live_chat_id()
    
    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Called on each execution cycle."""
        messages = await self._fetch_messages()
        
        for msg in messages:
            # Emit appropriate event
            if msg.get("superchat_amount"):
                await context.emit_event(Event(
                    type="message.superchat",
                    payload={
                        "message": msg,
                        "amount": msg["superchat_amount"],
                        "currency": msg["superchat_currency"]
                    }
                ))
            else:
                await context.emit_event(Event(
                    type="message.received",
                    payload={"message": msg}
                ))
        
        # Return latest message for downstream nodes
        if messages:
            return {"message": messages[-1]}
        return {"message": None}
    
    async def teardown(self):
        """Called when workflow stops."""
        await self.client.close()
    
    # Private methods...
    async def _create_client(self): ...
    async def _get_live_chat_id(self): ...
    async def _fetch_messages(self): ...
```

### 5.4 SDK Interface

```python
# aituber_flow_sdk/base.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Optional

@dataclass
class Event:
    type: str
    payload: dict

@dataclass  
class NodeContext:
    workflow_id: str
    node_id: str
    character: 'CharacterState'
    stream: 'StreamContext'
    
    async def emit_event(self, event: Event) -> None:
        """Emit an event to the event bus."""
        ...
    
    async def log(self, message: str, level: str = "info") -> None:
        """Send log to frontend."""
        ...
    
    async def update_character(self, updates: dict) -> None:
        """Update character state."""
        ...

class BaseNode(ABC):
    @abstractmethod
    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize the node."""
        pass
    
    @abstractmethod
    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Process inputs and return outputs."""
        pass
    
    async def teardown(self) -> None:
        """Cleanup resources."""
        pass
    
    async def on_event(self, event: Event, context: NodeContext) -> Optional[dict]:
        """Handle incoming events. Override for event-driven nodes."""
        return None
```

---

## 6. API Design

### 6.1 REST Endpoints

```yaml
# Workflow Management
POST   /api/workflows              # Create workflow
GET    /api/workflows              # List workflows
GET    /api/workflows/:id          # Get workflow
PUT    /api/workflows/:id          # Update workflow
DELETE /api/workflows/:id          # Delete workflow

# Workflow Execution
POST   /api/workflows/:id/start    # Start execution
POST   /api/workflows/:id/stop     # Stop execution
GET    /api/workflows/:id/status   # Get execution status

# Plugins
GET    /api/plugins                # List available plugins
GET    /api/plugins/:id            # Get plugin manifest
POST   /api/plugins/install        # Install from URL/marketplace

# Templates
GET    /api/templates              # List templates
POST   /api/templates              # Save as template
POST   /api/templates/:id/use      # Create workflow from template
```

### 6.2 WebSocket Events

```yaml
# Client -> Server
workflow.start:
  payload: { workflowId: string }

workflow.stop:
  payload: { workflowId: string }

node.config.update:
  payload: { nodeId: string, config: object }

# Server -> Client
log:
  payload: { level: string, message: string, nodeId?: string, timestamp: string }

node.status:
  payload: { nodeId: string, status: "idle" | "running" | "error", data?: any }

character.updated:
  payload: { character: CharacterState }

stream.updated:
  payload: { stream: StreamContext }

execution.error:
  payload: { nodeId: string, error: string, stack?: string }
```

---

## 7. Directory Structure

```
aituber-flow/
├── apps/
│   ├── web/                      # Next.js frontend
│   │   ├── app/
│   │   │   ├── page.tsx          # Landing page
│   │   │   ├── editor/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx  # Workflow editor
│   │   │   └── api/              # API routes (if needed)
│   │   ├── components/
│   │   │   ├── editor/
│   │   │   │   ├── Canvas.tsx
│   │   │   │   ├── Node.tsx
│   │   │   │   ├── Connection.tsx
│   │   │   │   └── Sidebar.tsx
│   │   │   ├── panels/
│   │   │   │   ├── NodeSettings.tsx
│   │   │   │   ├── LogPanel.tsx
│   │   │   │   └── CharacterPanel.tsx
│   │   │   └── ui/               # Shared UI components
│   │   ├── hooks/
│   │   │   ├── useWorkflow.ts
│   │   │   ├── useWebSocket.ts
│   │   │   └── useNodes.ts
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── types.ts
│   │   └── styles/
│   │
│   └── server/                   # FastAPI backend
│       ├── main.py               # Entry point
│       ├── routers/
│       │   ├── workflows.py
│       │   ├── plugins.py
│       │   └── websocket.py
│       ├── engine/
│       │   ├── executor.py       # Workflow execution
│       │   ├── event_bus.py      # Event routing
│       │   └── scheduler.py      # Timer triggers
│       ├── state/
│       │   ├── character.py
│       │   └── stream.py
│       ├── models/
│       │   ├── workflow.py
│       │   ├── node.py
│       │   └── event.py
│       └── db/
│           ├── database.py
│           └── migrations/
│
├── packages/
│   └── sdk/                      # Plugin SDK
│       ├── aituber_flow_sdk/
│       │   ├── __init__.py
│       │   ├── base.py           # BaseNode class
│       │   ├── context.py        # NodeContext
│       │   └── types.py          # Type definitions
│       ├── pyproject.toml
│       └── README.md
│
├── plugins/                      # Official plugins
│   ├── youtube-chat/
│   │   ├── manifest.json
│   │   ├── node.py
│   │   └── icon.svg
│   ├── twitch-chat/
│   ├── openai-llm/
│   ├── claude-llm/
│   ├── voicevox-tts/
│   ├── elevenlabs-tts/
│   ├── filter/
│   ├── switch/
│   └── delay/
│
├── templates/                    # Workflow templates
│   ├── basic-chat.json
│   ├── gaming-stream.json
│   └── music-stream.json
│
├── docs/
│   ├── getting-started.md
│   ├── plugin-development.md
│   └── api-reference.md
│
├── docker-compose.yml
├── README.md
└── LICENSE
```

---

## 8. MVP Requirements

### 8.1 Phase 1: Core (Week 1-2)

**Must Have:**
- [ ] Workflow editor UI with drag-and-drop nodes
- [ ] Node connection system
- [ ] Basic node types: Input, Process, Output
- [ ] Workflow save/load (SQLite)
- [ ] Simple execution engine (linear flow)

**Nodes to Implement:**
- [ ] `manual-input` - Text input for testing
- [ ] `openai-llm` - GPT-4 completion
- [ ] `console-output` - Display in log panel

### 8.2 Phase 2: Events (Week 3-4)

**Must Have:**
- [ ] Event bus implementation
- [ ] Event filtering on nodes
- [ ] WebSocket for real-time logs
- [ ] Character state management

**Nodes to Implement:**
- [ ] `youtube-chat` - Real YouTube integration
- [ ] `voicevox-tts` - Voice synthesis
- [ ] `switch` - Conditional routing
- [ ] `delay` - Time delay

### 8.3 Phase 3: Plugin System (Week 5-6)

**Must Have:**
- [ ] Plugin manifest loader
- [ ] Plugin SDK package
- [ ] Plugin hot-reload (dev mode)
- [ ] Basic plugin documentation

**Nice to Have:**
- [ ] Template system
- [ ] Plugin marketplace UI (list only)

---

## 9. Configuration

### 9.1 Environment Variables

```bash
# Server
DATABASE_URL=sqlite:///./aituber_flow.db
SECRET_KEY=your-secret-key
DEBUG=true

# External APIs (users provide their own)
# These are stored per-workflow, not globally

# WebSocket
WS_HEARTBEAT_INTERVAL=30
```

### 9.2 Default Character Config

```json
{
  "name": "AI Assistant",
  "personality": "Friendly and helpful virtual streamer",
  "emotion": {
    "current": "neutral",
    "intensity": 0.5
  },
  "memory": {
    "shortTerm": [],
    "longTerm": []
  }
}
```

---

## 10. Future Considerations

### 10.1 Not in MVP (But Planned)

- Live2D / VRM avatar integration
- Multi-character support
- Collaboration features
- Cloud hosting option
- Mobile app
- Analytics dashboard

### 10.2 Scaling Considerations

- Multiple workflow execution (worker pool)
- Plugin sandboxing for security
- Rate limiting for external APIs
- Caching layer for LLM responses

---

## Appendix A: Example Workflow JSON

```json
{
  "id": "wf_123",
  "name": "Basic Chat Response",
  "nodes": [
    {
      "id": "node_1",
      "type": "youtube-chat",
      "position": { "x": 100, "y": 200 },
      "config": {
        "videoId": "dQw4w9WgXcQ",
        "pollInterval": 3000
      }
    },
    {
      "id": "node_2",
      "type": "openai-llm",
      "position": { "x": 350, "y": 200 },
      "config": {
        "model": "gpt-4",
        "systemPrompt": "You are a cheerful VTuber named Airi.",
        "temperature": 0.8
      },
      "eventFilters": [
        { "event": "message.received" }
      ]
    },
    {
      "id": "node_3",
      "type": "voicevox-tts",
      "position": { "x": 600, "y": 200 },
      "config": {
        "speaker": 1,
        "speedScale": 1.0
      }
    }
  ],
  "connections": [
    {
      "id": "conn_1",
      "from": { "nodeId": "node_1", "port": "message" },
      "to": { "nodeId": "node_2", "port": "prompt" }
    },
    {
      "id": "conn_2",
      "from": { "nodeId": "node_2", "port": "response" },
      "to": { "nodeId": "node_3", "port": "text" }
    }
  ],
  "character": {
    "name": "Airi",
    "personality": "Cheerful, energetic, loves games"
  }
}
```

---

*Last updated: 2025-01-19*
*Version: 0.1.0-draft*
