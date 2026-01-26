# Getting Started with AITuberFlow

This guide will help you set up and run AITuberFlow on your local machine.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** 18 or higher
- **Python** 3.11 or higher
- **npm** (comes with Node.js)
- **[uv](https://docs.astral.sh/uv/)** (recommended) or pip

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-repo/aituber-flow.git
cd aituber-flow
```

### 2. Set Up the Backend (using uv - Recommended)

```bash
# Navigate to server directory
cd apps/server

# Install dependencies (uv will create .venv automatically)
uv sync

# Create environment file
cp .env.example .env
```

### 2. Set Up the Backend (using pip)

```bash
# Navigate to server directory
cd apps/server

# Create a Python virtual environment
python -m venv .venv

# Activate the virtual environment
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
```

### 3. Set Up the Frontend

```bash
# Navigate to web directory (from project root)
cd apps/web

# Install npm dependencies
npm install

# Create environment file
cp .env.example .env.local
```

## Running the Application

You can run AITuberFlow either using Docker (recommended for quick setup) or manually with local development tools.

### Option A: Using Docker (Recommended)

Docker provides the easiest way to get started without installing Python or Node.js locally.

#### Prerequisites for Docker

- **Docker** 20.10 or higher
- **Docker Compose** v2.0 or higher

#### Quick Start with Docker

```bash
# From project root
docker compose up --build
```

This will:
- Build both backend and frontend images
- Start the backend at `http://localhost:8000`
- Start the frontend at `http://localhost:3000`
- Create a persistent volume for the SQLite database

#### Docker Environment Variables

Create a `.env` file in the project root to customize settings:

```bash
# Backend settings
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:3000

# Frontend settings
FRONTEND_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### Production Deployment

For production environments:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### Useful Docker Commands

```bash
# View logs
docker compose logs -f

# Stop services
docker compose down

# Rebuild after code changes
docker compose up --build

# Remove all data (including database)
docker compose down -v
```

### Option B: Manual Setup

If you prefer to run the application without Docker:

### Start the Backend Server

```bash
# From apps/server (using uv)
uv run python main.py

# Or with pip (venv activated)
python main.py
```

The server will start at `http://localhost:8000`. You can access the API documentation at `http://localhost:8000/docs`.

### Start the Frontend Development Server

```bash
# From apps/web (in a new terminal)
npm run dev
```

The frontend will start at `http://localhost:3000`.

## Creating Your First Workflow

1. **Open the Application**
   - Navigate to `http://localhost:3000` in your browser
   - Click "New Workflow" to create a new workflow

2. **Add Nodes**
   - Drag nodes from the left sidebar onto the canvas
   - Available nodes:
     - **Manual Input**: Enter text to send downstream
     - **OpenAI LLM**: Generate AI responses
     - **Console Output**: Display text in the log panel

3. **Connect Nodes**
   - Click and drag from an output port (right side of a node)
   - Drop on an input port (left side of another node)
   - The connection will show as an animated line

4. **Configure Nodes**
   - Click on a node to select it
   - Use the Settings panel on the right to configure the node
   - For OpenAI LLM, you'll need to enter your API key

5. **Save Your Workflow**
   - Click the "Save" button in the toolbar
   - Your workflow will be persisted to the database

6. **Run the Workflow**
   - Click the "Start" button to execute the workflow
   - Watch the log panel at the bottom for execution progress
   - Click "Stop" to halt execution

## Example: Simple Chat Workflow

Create a basic workflow that takes input and generates an AI response:

1. Add a **Manual Input** node
   - Set "Input Text" to "Hello! What's 2 + 2?"

2. Add an **OpenAI LLM** node
   - Enter your OpenAI API key
   - Set System Prompt to "You are a helpful math tutor."
   - Choose a model (GPT-4o Mini is recommended for testing)

3. Add a **Console Output** node
   - Keep default settings

4. Connect the nodes:
   - Manual Input (text) → OpenAI LLM (prompt)
   - OpenAI LLM (response) → Console Output (text)

5. Save and run the workflow!

## Troubleshooting

### Docker issues

**Container fails to start:**
- Check if ports 8000 or 3000 are already in use: `lsof -i :8000` or `lsof -i :3000`
- View container logs: `docker compose logs backend` or `docker compose logs frontend`
- Try rebuilding: `docker compose build --no-cache`

**Frontend can't connect to backend:**
- Ensure both containers are on the same network: `docker network ls`
- Check if backend is healthy: `docker compose ps`
- Verify CORS settings in `.env`

**Database persistence:**
- Data is stored in a Docker volume named `aituberflow-backend-data`
- To reset: `docker compose down -v` (this deletes all data)

### Backend won't start

- If using uv: Run `uv sync` to ensure dependencies are installed
- If using pip: Make sure the virtual environment is activated and run `pip install -r requirements.txt`
- Verify Python version: `python --version` (should be 3.11+)

### Frontend won't start

- Make sure all npm packages are installed: `npm install`
- Check Node.js version: `node --version` (should be 18+)
- Try deleting `node_modules` and reinstalling

### Can't connect to backend

- Make sure the backend is running on port 8000
- Check `apps/web/.env.local` has the correct API URL
- Look for CORS errors in the browser console

### OpenAI errors

- Verify your API key is correct
- Check that you have API credits available
- Try a different model if rate limited

## Next Steps

- Read the [Architecture Overview](./architecture.md) to understand how AITuberFlow works
- Explore the [API Reference](./api-reference.md) for REST and WebSocket documentation
- Check out the [CLAUDE.md](../CLAUDE.md) for development guidelines
