# Create AITuberFlow Node

Create a new node plugin for AITuberFlow. This command guides you through creating all necessary files.

## Arguments

$ARGUMENTS
- `name`: Node name in kebab-case (e.g., `my-custom-node`)
- `description`: Brief description of what the node does

## Instructions

When the user wants to create a new node, follow these steps:

### Step 1: Gather Information

Ask the user for:
1. **Node name** (kebab-case, e.g., `my-custom-node`)
2. **Display name** (human-readable, e.g., `My Custom Node`)
3. **Description** (what does this node do?)
4. **Category** (`input`, `output`, `process`, `avatar`, `control`, `llm`, `tts`)
5. **Inputs** (list of input ports with id, type, description)
6. **Outputs** (list of output ports with id, type, description)
7. **Config options** (any user-configurable settings)
8. **Events** (emits/listens - for WebSocket communication)

### Step 2: Create Plugin Directory

```
plugins/{node-name}/
├── manifest.json
├── node.ts
└── README.md
```

### Step 3: Create manifest.json

Use this template:

```json
{
  "id": "{node-id}",
  "name": "{Display Name}",
  "version": "1.0.0",
  "description": "{Description}",
  "author": {
    "name": "AITuberFlow",
    "url": "https://github.com/oboroge0/AITuberFlow"
  },
  "license": "MIT",
  "category": "{category}",
  "ui": {
    "label": "{Display Name}",
    "icon": "{Icon}",
    "color": "#HEXCOLOR",
    "bgColor": "rgba(R, G, B, 0.1)",
    "statusText": "待機中..."
  },
  "node": {
    "inputs": [
      {
        "id": "{input-id}",
        "type": "string|number|boolean|audio|array|object",
        "description": "{Input description}"
      }
    ],
    "outputs": [
      {
        "id": "{output-id}",
        "type": "string|number|boolean|audio|array|object",
        "description": "{Output description}"
      }
    ],
    "events": {
      "emits": ["event.name"],
      "listens": ["event.name"]
    }
  },
  "config": {
    "configKey": {
      "type": "string|number|boolean|select|textarea",
      "label": "Config Label",
      "description": "Config description",
      "default": "default value"
    }
  }
}
```

### Step 4: Create node.ts

Use this template:

```typescript
/**
 * {Display Name} Node
 *
 * {Description}
 */

import { BaseNode, NodeContext, Event } from "@aituber-flow/sdk";

export default class {ClassName}Node extends BaseNode {
  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    // Read config values
    // this.someConfig = config.someConfig ?? "default";
    await context.log("{Display Name} initialized");
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    // Get inputs
    // const inputValue = inputs.inputId;

    // Process data

    // Emit events if needed
    // await context.emitEvent({ type: "event.name", payload: {} });

    // Return outputs
    return {
      // outputId: result,
    };
  }

  async onEvent(event: Event, context: NodeContext): Promise<Record<string, any> | null> {
    // Handle incoming events (optional)
    // if (event.type === "some.event") { }
    return null;
  }

  async teardown(): Promise<void> {
    // Cleanup when workflow stops
  }
}
```

Note: The node will be automatically registered in the frontend UI based on the `ui` section in `manifest.json`. No manual frontend file updates are needed.

### Color Guidelines

Use consistent colors based on category:
- **Input nodes**: Green tones (`#22C55E`, `#10B981`)
- **Output nodes**: Purple tones (`#A855F7`, `#8B5CF6`)
- **Process nodes**: Blue/Pink tones (`#3B82F6`, `#EC4899`)
- **LLM nodes**: Green (`#10B981` for OpenAI), Orange (`#D97706` for Claude)
- **TTS nodes**: Yellow/Orange tones (`#F59E0B`, `#E91E63`)
- **Avatar nodes**: Pink/Magenta tones (`#E879F9`, `#F472B6`)
- **Control nodes**: Orange tones (`#F97316`)

### Event Naming Convention

- `avatar.*` - Avatar-related events (expression, mouth, motion)
- `audio.*` - Audio playback events (play, stop)
- `subtitle` - Subtitle display events
- Use kebab-case for multi-word events: `avatar.expression`

### Type Mappings

| Manifest Type | TypeScript Type |
|--------------|-----------------|
| `string`     | `string`        |
| `number`     | `number`        |
| `boolean`    | `boolean`       |
| `audio`      | `string` (path) |
| `array`      | `any[]`         |
| `object`     | `Record<string, any>` |

## Example

Creating a "Text Counter" node that counts characters:

```
/create-node name=text-counter description="Counts characters in text"
```

This would create:
- `plugins/text-counter/manifest.json`
- `plugins/text-counter/node.ts`
- `plugins/text-counter/README.md`
