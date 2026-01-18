# AITuberFlow

A visual workflow editor for building AI-powered virtual streamers.

## Overview

AITuberFlow allows users to create custom AITuber pipelines by connecting nodes in a visual editor. Build event-driven AI characters without writing code.

## Features (MVP Phase 1)

- **Visual Workflow Editor**: Drag-and-drop node editor powered by React Flow
- **Node Connection System**: Connect nodes to create data pipelines
- **Basic Nodes**: Manual Input, OpenAI LLM, Console Output
- **Workflow Persistence**: Save and load workflows with SQLite
- **Real-time Execution**: WebSocket-based live execution logs

## Project Structure

```
aituber-flow/
├── apps/
│   ├── web/           # Next.js frontend
│   └── server/        # FastAPI backend
├── packages/
│   └── sdk/           # Plugin SDK
├── plugins/           # Official plugins
├── templates/         # Workflow templates
└── docs/
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip

### Backend Setup (using uv)

```bash
cd apps/server

# Install dependencies and create virtual environment
uv sync

# Copy environment file
cp .env.example .env

# Start the server
uv run python main.py
```

### Backend Setup (using pip)

```bash
cd apps/server

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Start the server
python main.py
```

The backend will be available at `http://localhost:8000`.

### Frontend Setup

```bash
cd apps/web

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:3000`.

## Usage

1. Open `http://localhost:3000` in your browser
2. Click "New Workflow" to create a workflow
3. Drag nodes from the sidebar onto the canvas
4. Connect nodes by dragging from output ports to input ports
5. Click on a node to configure its settings
6. Click "Save" to persist your workflow
7. Click "Start" to execute the workflow

## Basic Workflow Example

1. Add a **Manual Input** node - configure some input text
2. Add an **OpenAI LLM** node - add your API key and system prompt
3. Add a **Console Output** node
4. Connect: Manual Input → OpenAI LLM → Console Output
5. Run the workflow to see the AI response in the log panel

## API Documentation

When the backend is running, visit `http://localhost:8000/docs` for interactive API documentation.

## Plugin Development

See `packages/sdk/` for the Plugin SDK documentation.

Basic plugin structure:

```python
from aituber_flow_sdk import BaseNode, NodeContext

class MyNode(BaseNode):
    async def setup(self, config: dict, context: NodeContext) -> None:
        # Initialize with configuration
        pass

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        # Process inputs and return outputs
        return {"output": "result"}
```

## License

MIT
