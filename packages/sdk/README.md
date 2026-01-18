# AITuberFlow Plugin SDK

SDK for building custom nodes for AITuberFlow.

## Installation

```bash
pip install aituber-flow-sdk
```

Or for development:

```bash
cd packages/sdk
pip install -e .
```

## Quick Start

Create a new plugin by creating a directory with a `manifest.json` and `node.py`:

```
plugins/
  my-plugin/
    manifest.json
    node.py
```

### manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Description of my plugin",
  "author": {
    "name": "Your Name"
  },
  "license": "MIT",
  "category": "process",
  "node": {
    "inputs": [
      {"id": "input", "type": "string", "description": "Input text"}
    ],
    "outputs": [
      {"id": "output", "type": "string", "description": "Output text"}
    ]
  },
  "config": {
    "mySetting": {
      "type": "string",
      "label": "My Setting",
      "default": "default value"
    }
  }
}
```

### node.py

```python
from aituber_flow_sdk import BaseNode, NodeContext

class MyPluginNode(BaseNode):
    async def setup(self, config: dict, context: NodeContext) -> None:
        self.my_setting = config.get("mySetting", "default")
        await context.log("Plugin initialized")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        input_text = inputs.get("input", "")
        result = f"{self.my_setting}: {input_text}"
        await context.log(f"Processed: {result}")
        return {"output": result}

    async def teardown(self) -> None:
        pass
```

## API Reference

### BaseNode

The base class for all nodes.

#### Methods

- `setup(config, context)`: Initialize the node with configuration
- `execute(inputs, context)`: Process inputs and return outputs
- `teardown()`: Clean up resources
- `on_event(event, context)`: Handle incoming events (optional)

### NodeContext

Context passed to node methods.

#### Properties

- `workflow_id`: Current workflow ID
- `node_id`: Current node ID
- `character`: Character state dictionary

#### Methods

- `emit_event(event)`: Emit an event to the event bus
- `log(message, level)`: Send a log message
- `update_character(updates)`: Update character state
- `get_character_name()`: Get character name
- `get_character_personality()`: Get character personality

### Event

Represents an event in the system.

```python
from aituber_flow_sdk import Event

event = Event(
    type="my.event",
    payload={"key": "value"}
)
await context.emit_event(event)
```

## Node Categories

- `input`: Nodes that generate data (no inputs)
- `process`: Nodes that transform data
- `output`: Nodes that consume data (no outputs)
- `control`: Nodes that control flow (switches, delays)

## Config Field Types

- `string`: Single-line text input
- `textarea`: Multi-line text input
- `number`: Numeric input (with optional min/max)
- `boolean`: Checkbox
- `select`: Dropdown with options

## License

MIT
