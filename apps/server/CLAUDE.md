# AITuberFlow Backend (apps/server)

## Overview

FastAPI backend server with WebSocket support for real-time communication. Handles workflow execution, plugin loading, and API endpoints.

## Directory Structure

```
apps/server/
├── main.py              # FastAPI app, Socket.IO setup, event handlers
├── engine/
│   ├── executor.py      # WorkflowExecutor - DAG execution engine
│   └── event_bus.py     # EventBus for inter-node communication
├── routers/
│   ├── workflows.py     # /api/workflows - CRUD and execution
│   ├── plugins.py       # /api/plugins - Plugin discovery
│   ├── templates.py     # /api/templates - Workflow templates
│   └── integrations.py  # /api/integrations - External service APIs
├── models/
│   └── workflow.py      # Pydantic models (NodeModel, ConnectionModel, etc.)
├── db/
│   └── database.py      # SQLAlchemy + SQLite setup
├── state/
│   ├── character.py     # Character state management
│   └── stream.py        # Streaming/execution state
├── audio_output/        # Generated audio files (served statically)
├── pyproject.toml       # Python dependencies
└── .env.example         # Environment template
```

## Key Components

### main.py
- FastAPI application setup
- CORS configuration
- Socket.IO server for WebSocket
- Event handlers for workflow control
- Shares executor instance with routers

### WorkflowExecutor (engine/executor.py)
- Executes workflows as DAGs (Directed Acyclic Graphs)
- Manages node lifecycle (setup → execute → teardown)
- Handles event-driven nodes (chat listeners, timers)
- Background task management
- Log/status/event callbacks to frontend

### Routers

| Router | Prefix | Description |
|--------|--------|-------------|
| workflows | `/api/workflows` | Workflow CRUD, start/stop execution |
| plugins | `/api/plugins` | List available plugins from `plugins/` |
| templates | `/api/templates` | List workflow templates from `templates/` |
| integrations | `/api/integrations` | VOICEVOX speakers, OBS status, etc. |

## API Endpoints

### Workflows
```
GET    /api/workflows          # List all workflows
POST   /api/workflows          # Create workflow
GET    /api/workflows/{id}     # Get workflow by ID
PUT    /api/workflows/{id}     # Update workflow
DELETE /api/workflows/{id}     # Delete workflow
POST   /api/workflows/{id}/start?node_id=xxx  # Start execution from node
POST   /api/workflows/{id}/stop               # Stop execution
```

### Plugins
```
GET    /api/plugins            # List all plugins (reads manifests)
```

### Templates
```
GET    /api/templates          # List all templates
GET    /api/templates/{name}   # Get template by name
```

### Integrations
```
POST   /api/integrations/voicevox/speakers  # Get VOICEVOX speakers
GET    /api/integrations/obs/status         # OBS connection status
```

## WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join` | `{workflowId}` | Join workflow room |
| `leave` | `{workflowId}` | Leave workflow room |
| `workflow_start` | `{workflowId}` | Start execution |
| `workflow_stop` | `{workflowId}` | Stop execution |
| `node_input` | `{workflowId, nodeId, data}` | Manual input |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `log` | `{nodeId, message, level, timestamp}` | Node log message |
| `node.status` | `{nodeId, status, data}` | Node status change |
| `audio` | `{filename, duration, text}` | Audio generated |
| `avatar.expression` | `{expression, intensity}` | Expression change |
| `avatar.mouth` | `{value}` | Lip sync value |
| `avatar.motion` | `{motion}` | Animation trigger |
| `subtitle` | `{text}` | Subtitle update |
| `execution.started` | | Workflow started |
| `execution.stopped` | `{reason}` | Workflow stopped |

## Environment Variables

```bash
# .env
DATABASE_URL=sqlite:///./aituber_flow.db  # SQLite database path
PORT=8001                                   # Server port
DEBUG=true                                  # Debug mode
SECRET_KEY=your-secret-key                  # Session key (change in prod)
CORS_ORIGINS=http://localhost:3000          # Comma-separated origins
```

## Running

```bash
# Development
uv sync
cp .env.example .env
uv run python main.py

# Or with uvicorn directly
uv run uvicorn main:socket_app --reload --port 8001

# Production
uvicorn main:socket_app --host 0.0.0.0 --port 8001
```

## Adding a New Router

1. Create `routers/my_router.py`:
```python
from fastapi import APIRouter

router = APIRouter(prefix="/api/my-endpoint", tags=["my-endpoint"])

@router.get("/")
async def list_items():
    return {"items": []}
```

2. Register in `main.py`:
```python
from routers import my_router
app.include_router(my_router.router)
```

## Plugin Loading

Plugins are loaded dynamically from `../../plugins/`:
1. Scan plugin directories
2. Parse `manifest.json` for metadata
3. Import `node.py` module
4. Find class extending `BaseNode`
5. Register in executor's node registry

## Database

- SQLite with SQLAlchemy 2.0
- Async support via aiosqlite
- Models in `models/workflow.py`
- Schema auto-created on startup

## Audio Output

Generated TTS audio files are saved to `audio_output/`:
- Served at `/audio_output/{filename}`
- Frontend fetches for playback
- Clean up periodically in production

## Debugging

- Set `DEBUG=true` in `.env`
- View logs in terminal
- Use `/docs` for Swagger UI
- Socket.IO events logged at INFO level

## Dependencies

Key packages (see pyproject.toml):
- `fastapi>=0.109.0` - Web framework
- `uvicorn[standard]` - ASGI server
- `python-socketio>=5.11.0` - WebSocket
- `sqlalchemy>=2.0.25` - ORM
- `aiosqlite>=0.19.0` - Async SQLite
- `pydantic>=2.5.3` - Data validation
- `openai>=1.10.0` - OpenAI API
- `obsws-python>=1.7.0` - OBS control (optional)
