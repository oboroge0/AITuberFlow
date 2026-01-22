# Contributing to AITuberFlow

Thank you for your interest in contributing to AITuberFlow! This document provides guidelines and instructions for contributing.

[日本語版](CONTRIBUTING.ja.md)

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Plugin Development](#plugin-development)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Types of Contributions

We welcome the following types of contributions:

- **Bug fixes** - Fix issues in existing code
- **New plugins** - Add new nodes to extend functionality
- **Documentation** - Improve or translate documentation
- **Feature enhancements** - Add new features to existing code
- **Tests** - Add or improve test coverage

### Issues

- Check existing issues before creating a new one
- Use issue templates when available
- Provide clear reproduction steps for bugs
- Include relevant environment information

## Development Setup

### Prerequisites

- Node.js 18+
- Python 3.11+
- Git

### Setting Up the Development Environment

1. **Fork and clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/AITuberFlow.git
cd AITuberFlow
```

2. **Set up the backend**

```bash
cd apps/server

# Using uv (recommended)
uv sync
uv pip install -e ../../packages/sdk

# Or using pip
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
pip install -e ../../packages/sdk

# Copy environment config
cp .env.example .env
```

3. **Set up the frontend**

```bash
cd apps/web
npm install
cp .env.example .env.local
```

4. **Start development servers**

```bash
# Terminal 1: Backend
cd apps/server
uv run python main.py  # or python main.py with venv activated

# Terminal 2: Frontend
cd apps/web
npm run dev
```

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/add-twitter-integration` - New features
- `fix/audio-playback-issue` - Bug fixes
- `docs/update-readme` - Documentation changes
- `plugin/image-generation` - New plugins

### Commit Messages

Write clear, concise commit messages:

```
type: short description

Longer description if needed.
Explain the "why" not just the "what".
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `plugin`: New or updated plugin
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat: add Discord chat integration node

fix: resolve audio playback timing issue on Safari

docs: add Japanese translation for CONTRIBUTING.md

plugin: add image-generation node using DALL-E
```

## Pull Request Process

1. **Ensure your changes are ready**
   - Code follows project coding standards
   - Tests pass locally
   - Documentation is updated if needed

2. **Create a Pull Request**
   - Use a clear, descriptive title
   - Reference related issues (`Fixes #123`)
   - Provide a summary of changes
   - Include screenshots for UI changes

3. **PR Review**
   - Maintainers will review your PR
   - Address any requested changes
   - Be patient and responsive

4. **Merge**
   - PRs are merged after approval
   - Squash merge is preferred for clean history

## Plugin Development

### Creating a New Plugin

1. Create a new directory in `plugins/`:

```
plugins/my-plugin/
├── manifest.json
└── node.py
```

2. Define the manifest (`manifest.json`):

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Description of what the plugin does",
  "category": "utility",
  "inputs": [
    {
      "id": "text",
      "name": "Text Input",
      "type": "string"
    }
  ],
  "outputs": [
    {
      "id": "result",
      "name": "Result",
      "type": "string"
    }
  ],
  "config": [
    {
      "id": "setting",
      "name": "Setting",
      "type": "string",
      "default": "default value"
    }
  ]
}
```

3. Implement the node (`node.py`):

```python
from aituber_flow_sdk import BaseNode, NodeContext

class MyPluginNode(BaseNode):
    async def setup(self, config: dict, context: NodeContext) -> None:
        self.setting = config.get("setting", "default")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        text = inputs.get("text", "")
        result = f"Processed: {text}"
        return {"result": result}

    async def teardown(self) -> None:
        pass
```

4. Register in frontend (update `Sidebar.tsx` and `Canvas.tsx`)

### Plugin Guidelines

- One responsibility per plugin
- Handle errors gracefully
- Log meaningful messages
- Clean up resources in `teardown()`
- Document configuration options

## Coding Standards

### Python (Backend & Plugins)

- Follow PEP 8 style guidelines
- Use type hints where possible
- Use async/await for I/O operations
- Document public functions with docstrings

```python
async def process_message(text: str, config: dict) -> dict:
    """
    Process an incoming message.

    Args:
        text: The input text to process
        config: Configuration dictionary

    Returns:
        Dictionary containing processed result
    """
    pass
```

### TypeScript (Frontend)

- Use TypeScript strict mode
- Define interfaces for data structures
- Use meaningful variable names
- Follow React best practices

```typescript
interface NodeConfig {
  id: string;
  type: string;
  position: { x: number; y: number };
}

const processNode = (config: NodeConfig): void => {
  // Implementation
};
```

## Testing

### Running Tests

```bash
# Backend tests
cd apps/server
uv run pytest -v

# Frontend tests (when available)
cd apps/web
npm test
```

### Writing Tests

- Test edge cases and error conditions
- Use descriptive test names
- Mock external services

```python
@pytest.mark.asyncio
async def test_node_handles_empty_input():
    node = MyPluginNode()
    result = await node.execute({"text": ""}, mock_context)
    assert result["result"] == "Processed: "
```

## Documentation

### When to Update Documentation

- Adding new features
- Changing existing behavior
- Adding new plugins
- Modifying API endpoints

### Documentation Locations

- `README.md` / `README.ja.md` - Project overview
- `docs/` - Detailed documentation
- `packages/sdk/README.md` - SDK documentation
- Code comments - Implementation details

---

## Questions?

If you have questions about contributing:

1. Check existing documentation
2. Search closed issues
3. Open a new issue with the "question" label

Thank you for contributing to AITuberFlow!
