# AITuberFlow Development Guide

## Project Overview

AITuberFlow is a visual workflow editor for creating AI VTuber streaming setups. Users connect nodes in a graph to build pipelines that handle:
- Chat input (YouTube, Twitch, Discord)
- LLM responses (OpenAI, Anthropic, Google, Ollama)
- Text-to-Speech (VOICEVOX, COEIROINK, Style-Bert-VITS2)
- Avatar control (VRM models, expressions, lip sync)
- Audio playback and subtitle display
- OBS integration (scene switching, source control)

## Architecture

```
AITuberFlow/
├── apps/
│   ├── server/          # Python FastAPI backend (see apps/server/CLAUDE.md)
│   └── web/             # Next.js frontend (see apps/web/CLAUDE.md)
├── packages/
│   └── sdk/             # Python SDK for node development
├── plugins/             # Node plugins (see plugins/CLAUDE.md)
├── templates/           # Workflow templates (JSON)
└── docs/                # Documentation
```

## Quick Start

```bash
# Backend (Terminal 1)
cd apps/server
uv sync
cp .env.example .env
uv run python main.py

# Frontend (Terminal 2)
cd apps/web
npm install
npm run dev
```

Access the editor at `http://localhost:3000/editor/{workflow-id}`

## Available Plugins (33 nodes)

### Input Nodes
- `youtube-chat` - YouTube Live chat listener
- `twitch-chat` - Twitch chat listener
- `discord-chat` - Discord bot integration
- `timer` - Periodic trigger
- `manual-input` - Manual text input

### LLM Nodes
- `openai-llm` - OpenAI GPT models
- `anthropic-llm` - Anthropic Claude models
- `google-llm` - Google Gemini models
- `ollama-llm` - Local Ollama models

### TTS Nodes
- `voicevox-tts` - VOICEVOX synthesis
- `coeiroink-tts` - COEIROINK synthesis
- `sbv2-tts` - Style-Bert-VITS2 synthesis

### Avatar Nodes
- `avatar-configuration` - Avatar settings
- `lip-sync` - Audio lip sync
- `emotion-analyzer` - Text to emotion
- `motion-trigger` - Animation trigger

### Control Nodes
- `start` / `end` - Flow markers
- `switch` - Conditional branching
- `loop` / `foreach` - Iteration
- `delay` - Timed delay

### Process Nodes
- `text-transform` - Text manipulation
- `data-formatter` - Data formatting
- `http-request` - HTTP API calls
- `random` - Random selection
- `variable` - Variable storage

### Output Nodes
- `audio-player` - Audio playback
- `subtitle-display` - Subtitle overlay
- `console-output` - Debug logging
- `donation-alert` - Donation display

### OBS Nodes
- `obs-scene-switch` - Scene switching
- `obs-source-toggle` - Source visibility

## Node Development

See `plugins/CLAUDE.md` for detailed plugin development guide.

### Quick Plugin Structure

```
plugins/{node-name}/
├── manifest.json    # Metadata, inputs, outputs, config
└── node.py          # Python implementation
```

### BaseNode Template

```python
from aituber_flow_sdk import BaseNode, NodeContext

class MyNode(BaseNode):
    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize node with config"""
        self.setting = config.get("setting", "default")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Process inputs and return outputs"""
        return {"output": result}

    async def teardown(self) -> None:
        """Cleanup resources"""
        pass
```

### Frontend Registration

When adding a new node, update these files:
1. `apps/web/components/editor/Sidebar.tsx` - Add to node palette
2. `apps/web/components/editor/Canvas.tsx` - Define metadata (nodeTypeMap)
3. `apps/web/components/editor/CustomNode.tsx` - Add icon and colors

## Event System

Real-time communication between nodes and frontend:

```python
await context.emit_event(Event(
    type="avatar.expression",
    payload={"expression": "happy", "intensity": 0.8}
))
```

### Common Events
| Event | Description | Payload |
|-------|-------------|---------|
| `avatar.expression` | Change expression | `{expression, intensity}` |
| `avatar.mouth` | Lip sync value | `{value: 0.0-1.0}` |
| `avatar.motion` | Trigger animation | `{motion, loop}` |
| `audio.play` | Play audio | `{url, volume}` |
| `audio.stop` | Stop playback | `{}` |
| `subtitle` | Show subtitle | `{text, duration}` |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/workflows` | List workflows |
| `POST /api/workflows` | Create workflow |
| `GET /api/workflows/{id}` | Get workflow |
| `PUT /api/workflows/{id}` | Update workflow |
| `DELETE /api/workflows/{id}` | Delete workflow |
| `GET /api/plugins` | List available plugins |
| `GET /api/templates` | List templates |
| `POST /api/integrations/voicevox/speakers` | Get VOICEVOX speakers |

WebSocket: `ws://localhost:8001/ws/socket.io`

## Overlay System

OBS-compatible overlay at `/overlay/[workflowId]`:
- Transparent background for browser source
- URL parameters: `model`, `animation`, `scale`, `x`, `y`, `subtitle`, `subPosition`, `subFontSize`, `volume`, `debug`

Example: `http://localhost:3000/overlay/abc123?subtitle=true&subPosition=bottom`

## Repository Guidelines

### Branch Naming
- `feature/add-xxx` - New features
- `fix/issue-description` - Bug fixes
- `docs/update-xxx` - Documentation
- `plugin/node-name` - New plugins

### Commit Messages
```
type: short description

type: feat | fix | docs | plugin | refactor | test | chore
```

Examples:
```
feat: add Discord chat integration node
fix: resolve audio playback timing issue
plugin: add image-generation node
```

### Pull Request Process
1. Create feature branch from main
2. Make changes following coding standards
3. Test locally
4. Create PR with clear description
5. Address review feedback
6. Squash merge when approved

## Environment Configuration

### Backend (.env)
```bash
DATABASE_URL=sqlite:///./aituber_flow.db
PORT=8001
DEBUG=true
SECRET_KEY=your-secret-key
CORS_ORIGINS=http://localhost:3000
```

### External Services
- **VOICEVOX**: Run locally on port 50021
- **OBS WebSocket**: Enable in OBS settings (port 4455)
- **LLM APIs**: Set API keys in node config

## Development Tips

1. **Single Responsibility**: Each node does one thing well
2. **Events for Real-time**: Use events for time-sensitive data (lip sync, expressions)
3. **Outputs for Data Flow**: Use outputs for data flowing to next node
4. **Pass-through Outputs**: Include input data in outputs when downstream nodes need it
5. **Async/Await**: All node methods are async
6. **Error Handling**: Log errors with `await context.log(message, level="error")`
7. **Type Safety**: Match manifest types with Python implementations

## Testing

```bash
# Backend
cd apps/server
uv run pytest -v

# Frontend
cd apps/web
npm test
```

## Commands

Use `/create-node` to scaffold a new node plugin with all required files.

## Related Documentation

- `apps/server/CLAUDE.md` - Backend development details
- `apps/web/CLAUDE.md` - Frontend development details
- `plugins/CLAUDE.md` - Plugin development guide
- `CONTRIBUTING.md` - Contribution guidelines
- `docs/getting-started.md` - User guide
