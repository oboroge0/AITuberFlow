# AITuberFlow Development Guide

## Project Overview

AITuberFlow is a visual workflow editor for creating AI VTuber streaming setups. Users connect nodes in a graph to build pipelines that handle:
- Chat input (YouTube, Twitch)
- LLM responses (OpenAI, Anthropic, Google, Ollama)
- Text-to-Speech (VOICEVOX, COEIROINK, Style-Bert-VITS2)
- Avatar control (VRM models, expressions, lip sync)
- Audio playback and subtitle display

## Architecture

```
AITuberFlow/
├── apps/
│   ├── server/          # Python FastAPI backend
│   │   ├── engine/      # Workflow execution engine
│   │   ├── routers/     # API endpoints
│   │   └── main.py      # Server entry point
│   └── web/             # Next.js frontend
│       ├── app/         # Pages (editor, overlay)
│       ├── components/  # React components
│       └── stores/      # Zustand state management
├── packages/
│   └── sdk/             # Python SDK for node development
│       └── aituber_flow_sdk/
├── plugins/             # Node plugins (each in own directory)
│   ├── {node-name}/
│   │   ├── manifest.json
│   │   └── node.py
└── templates/           # Workflow templates (JSON)
```

## Node Development

### Plugin Structure

Each node is a plugin in `plugins/{node-name}/`:
- `manifest.json` - Node metadata, inputs, outputs, config schema
- `node.py` - Python implementation extending `BaseNode`

### BaseNode Methods

```python
class MyNode(BaseNode):
    async def setup(self, config: dict, context: NodeContext) -> None:
        """Called once when workflow starts"""
        pass

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Called each time the node runs, returns outputs"""
        return {"output_id": value}

    async def on_event(self, event: Event, context: NodeContext) -> Optional[dict]:
        """Handle WebSocket events (optional)"""
        return None

    async def teardown(self) -> None:
        """Called when workflow stops"""
        pass
```

### NodeContext API

```python
await context.log(message, level="info")  # Log to frontend
await context.emit_event(Event(type="event.name", payload={}))  # WebSocket event
context.create_task(coroutine)  # Background task
context.cancel_background_tasks()  # Cancel all tasks
```

### Frontend Registration

When adding a new node, update:
1. `apps/web/components/editor/Sidebar.tsx` - Node palette
2. `apps/web/components/editor/Canvas.tsx` - Node metadata (colors, labels, inputs/outputs)
3. `apps/web/components/editor/CustomNode.tsx` - Node appearance (icon, colors)

## Node Categories

- `input` - Data sources (chat, timer, manual input)
- `output` - Endpoints (console, subtitle, audio player)
- `process` - Data transformation (LLM, text transform, emotion analyzer)
- `avatar` - Avatar control (avatar-controller, lip-sync)
- `control` - Flow control (switch, delay, loop)
- `llm` - LLM providers
- `tts` - Text-to-Speech engines

## Event System

Events enable real-time communication between nodes and frontend:

```python
# Emit from node
await context.emit_event(Event(
    type="avatar.expression",
    payload={"expression": "happy", "intensity": 0.8}
))
```

Common events:
- `avatar.expression` - Change avatar expression
- `avatar.mouth` - Lip sync mouth value (0.0-1.0)
- `avatar.motion` - Trigger animation
- `audio.play` - Play audio file
- `audio.stop` - Stop audio playback
- `subtitle` - Display subtitle text

## Overlay System

OBS-compatible overlay at `/overlay/[workflowId]`:
- Unified overlay with avatar, subtitles, and audio playback
- Transparent background for OBS Browser Source
- URL parameters: model, animation, scale, x, y, subtitle, subPosition, subFontSize, volume, debug

## Commands

Use `/create-node` to scaffold a new node plugin with all required files.

## Development Tips

1. **Single Responsibility**: Each node should do one thing well
2. **Events for Real-time**: Use events for time-sensitive data (lip sync, expressions)
3. **Outputs for Data Flow**: Use outputs for data that flows to next node
4. **Pass-through Outputs**: Include input data in outputs when downstream nodes need it
5. **Async/Await**: All node methods are async - use `await` properly
6. **Type Safety**: Match manifest types with Python/TypeScript implementations

## Running the Project

```bash
# Backend (from apps/server)
uv run uvicorn main:app --reload --port 8000

# Frontend (from apps/web)
bun dev
```

## Testing Workflows

1. Open editor at `http://localhost:3000/editor/{workflow-id}`
2. Add nodes from sidebar
3. Connect nodes by dragging between ports
4. Configure nodes in the right panel
5. Click play button to run from a node
