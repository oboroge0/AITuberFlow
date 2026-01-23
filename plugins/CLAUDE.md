# AITuberFlow Plugin Development Guide

## Overview

Plugins are the building blocks of AITuberFlow workflows. Each plugin defines a node that can be connected to others in the visual editor.

## Plugin Structure

```
plugins/{plugin-name}/
├── manifest.json    # Metadata, inputs, outputs, config schema
└── node.py          # Python implementation
```

## manifest.json Schema

```json
{
  "$schema": "https://aituber-flow.dev/schemas/plugin-manifest.json",
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/username"
  },
  "license": "MIT",
  "category": "process",
  "node": {
    "inputs": [
      {
        "id": "input_id",
        "type": "string",
        "description": "Input description"
      }
    ],
    "outputs": [
      {
        "id": "output_id",
        "type": "string",
        "description": "Output description"
      }
    ],
    "events": {
      "emits": ["event.name"],
      "listens": ["other.event"]
    }
  },
  "config": {
    "setting": {
      "type": "string",
      "label": "Setting Label",
      "description": "Help text",
      "default": "default value",
      "required": false
    }
  },
  "dependencies": {
    "python": ["httpx>=0.26.0"]
  }
}
```

### Categories
- `input` - Data sources (chat, timer, manual input)
- `output` - Endpoints (console, audio player, subtitle)
- `process` - Data transformation
- `control` - Flow control (switch, loop, delay)
- `avatar` - Avatar control
- `llm` - LLM providers
- `tts` - Text-to-Speech

### Config Field Types
| Type | Description | Extra Options |
|------|-------------|---------------|
| `string` | Text input | - |
| `number` | Numeric input | `min`, `max` |
| `boolean` | Checkbox | - |
| `select` | Dropdown | `options: ["a", "b"]` |
| `textarea` | Multi-line text | - |

### Port Types
- `string` - Text data
- `number` - Numeric data
- `boolean` - True/false
- `object` - JSON object
- `array` - List of items
- `Message` - Chat message object (author, text, timestamp)
- `any` - Accept any type

## node.py Implementation

### Basic Template

```python
import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event


class MyPluginNode(BaseNode):
    """My Plugin - brief description."""

    def __init__(self):
        self.setting = "default"

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Called once when workflow starts."""
        self.setting = config.get("setting", "default")
        await context.log(f"Initialized with setting: {self.setting}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Called each time the node runs. Returns outputs."""
        input_value = inputs.get("input_id", "")

        # Process the input
        result = f"Processed: {input_value}"

        await context.log(f"Processing complete")
        return {"output_id": result}

    async def teardown(self) -> None:
        """Called when workflow stops. Clean up resources."""
        pass
```

### Event-Driven Node (e.g., Chat Listener)

```python
import asyncio
from aituber_flow_sdk import BaseNode, NodeContext, Event


class EventDrivenNode(BaseNode):
    """Node that emits events from a background task."""

    def __init__(self):
        self._running = False
        self._task = None
        self._context = None

    async def setup(self, config: dict, context: NodeContext) -> None:
        self._context = context
        self._running = True
        # Start background polling
        self._task = asyncio.create_task(self._poll_loop())

    async def _poll_loop(self):
        """Background task that emits events."""
        while self._running:
            try:
                # Check for new data...
                data = await self._fetch_data()
                if data:
                    await self._context.emit_event(Event(
                        type="data.received",
                        payload={"data": data}
                    ))
            except Exception as e:
                await self._context.log(f"Error: {e}", "error")

            await asyncio.sleep(1)

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Return status (events are emitted in background)."""
        return {"status": "running" if self._running else "stopped"}

    async def teardown(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
```

### Node with External API

```python
try:
    import httpx
except ImportError:
    httpx = None


class APINode(BaseNode):
    def __init__(self):
        self.client = None
        self.api_key = None

    async def setup(self, config: dict, context: NodeContext) -> None:
        if httpx is None:
            await context.log("httpx not installed", "error")
            return

        self.api_key = config.get("apiKey")
        if not self.api_key:
            await context.log("API key required", "error")
            return

        self.client = httpx.AsyncClient()

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        if not self.client:
            return {"error": "Not initialized"}

        response = await self.client.post(
            "https://api.example.com/v1/endpoint",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"input": inputs.get("text")}
        )
        response.raise_for_status()
        return response.json()

    async def teardown(self) -> None:
        if self.client:
            await self.client.aclose()
```

## NodeContext API

```python
# Logging
await context.log("Message", level="info")  # info, warn, error

# Emit events to frontend
await context.emit_event(Event(
    type="event.type",
    payload={"key": "value"}
))

# Background tasks (advanced)
context.create_task(coroutine)
context.cancel_background_tasks()
```

## Common Events

### Avatar Events
```python
# Change expression
await context.emit_event(Event(
    type="avatar.expression",
    payload={"expression": "happy", "intensity": 0.8}
))

# Lip sync (0.0 to 1.0)
await context.emit_event(Event(
    type="avatar.mouth",
    payload={"value": 0.5}
))

# Trigger animation
await context.emit_event(Event(
    type="avatar.motion",
    payload={"motion": "wave"}
))
```

### Audio Events
```python
# Play audio (after generating)
await context.emit_event(Event(
    type="audio.generated",
    payload={"filename": "output.wav", "duration": 2.5}
))

# Stop audio
await context.emit_event(Event(
    type="audio.stop",
    payload={}
))
```

### Subtitle Events
```python
await context.emit_event(Event(
    type="subtitle",
    payload={"text": "Hello, world!"}
))
```

## Frontend Registration

After creating a plugin, register it in the frontend:

### 1. apps/web/components/editor/Canvas.tsx

Add to `nodeTypeMap`:
```typescript
'my-plugin': {
  label: 'My Plugin',
  category: 'process',
  color: '#10b981',
  inputs: [
    { id: 'input_id', label: 'Input', type: 'string' }
  ],
  outputs: [
    { id: 'output_id', label: 'Output', type: 'string' }
  ],
},
```

### 2. apps/web/components/editor/Sidebar.tsx

Add to appropriate category:
```typescript
const nodeCategories = {
  process: [
    // ...
    { type: 'my-plugin', label: 'My Plugin' },
  ],
};
```

### 3. apps/web/components/editor/CustomNode.tsx (optional)

Add icon:
```typescript
import { MyIcon } from 'lucide-react';

const nodeIcons: Record<string, React.ReactNode> = {
  'my-plugin': <MyIcon className="w-4 h-4" />,
  // ...
};
```

## Best Practices

1. **Single Responsibility**: One node = one task
2. **Error Handling**: Always log errors, return gracefully
3. **Resource Cleanup**: Close connections in `teardown()`
4. **Pass-through Data**: Include input data in outputs when downstream needs it
5. **Meaningful Logs**: Log at appropriate levels (info, warn, error)
6. **Type Consistency**: Match manifest types with Python return types
7. **Async/Await**: All methods are async - use `await` properly
8. **Optional Dependencies**: Check for imports before using

## Existing Plugins Reference

| Plugin | Category | Description |
|--------|----------|-------------|
| `youtube-chat` | input | YouTube Live chat listener |
| `twitch-chat` | input | Twitch chat listener |
| `discord-chat` | input | Discord bot integration |
| `timer` | input | Periodic trigger |
| `manual-input` | input | Manual text input |
| `openai-llm` | llm | OpenAI GPT models |
| `anthropic-llm` | llm | Anthropic Claude models |
| `google-llm` | llm | Google Gemini models |
| `ollama-llm` | llm | Local Ollama models |
| `voicevox-tts` | tts | VOICEVOX synthesis |
| `coeiroink-tts` | tts | COEIROINK synthesis |
| `sbv2-tts` | tts | Style-Bert-VITS2 |
| `text-transform` | process | Text manipulation |
| `data-formatter` | process | Data formatting |
| `http-request` | process | HTTP API calls |
| `emotion-analyzer` | avatar | Text to emotion |
| `lip-sync` | avatar | Audio lip sync |
| `motion-trigger` | avatar | Animation trigger |
| `switch` | control | Conditional branching |
| `loop` / `foreach` | control | Iteration |
| `delay` | control | Timed delay |
| `audio-player` | output | Audio playback |
| `subtitle-display` | output | Subtitle overlay |
| `console-output` | output | Debug logging |
| `obs-scene-switch` | control | OBS scene control |
| `obs-source-toggle` | control | OBS source control |

## Testing Your Plugin

1. Place plugin in `plugins/my-plugin/`
2. Restart backend server (plugins are loaded on startup)
3. Check `/api/plugins` endpoint for your plugin
4. Add to frontend registration files
5. Restart frontend
6. Node should appear in sidebar
7. Test in editor workflow

## Debugging Tips

- Check server logs for plugin loading errors
- Use `await context.log()` liberally during development
- Test with simple inputs first
- Verify manifest JSON is valid
- Ensure class name ends with `Node` (e.g., `MyPluginNode`)
