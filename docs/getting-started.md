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

- Explore the [API Reference](./api-reference.md)
- Learn about [Plugin Development](./plugin-development.md)
- Check out the [SPEC.md](../SPEC.md) for full technical details
