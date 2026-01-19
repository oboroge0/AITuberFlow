"""
Variable Node

Stores and retrieves values.
"""

import sys
import json
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext


class VariableNode(BaseNode):
    """
    Variable Node

    Stores and outputs a value.
    """

    def __init__(self):
        self.name = "myVariable"
        self.default_value = ""
        self.value_type = "string"

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.name = config.get("name", "myVariable")
        self.default_value = config.get("defaultValue", "")
        self.value_type = config.get("valueType", "string")

        await context.log(f"Variable '{self.name}' configured")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Output the variable value."""
        # Use input value if provided, otherwise use default
        value = inputs.get("set")

        if value is None:
            value = self.default_value

        # Convert to the specified type
        try:
            if self.value_type == "number":
                value = float(value) if '.' in str(value) else int(value)
            elif self.value_type == "boolean":
                if isinstance(value, str):
                    value = value.lower() in ('true', '1', 'yes')
                else:
                    value = bool(value)
            elif self.value_type == "json":
                if isinstance(value, str):
                    value = json.loads(value)
            else:  # string
                value = str(value)
        except (ValueError, json.JSONDecodeError) as e:
            await context.log(f"Type conversion failed: {e}", "warning")

        await context.log(f"Variable '{self.name}' = {value}")
        return {"value": value}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
