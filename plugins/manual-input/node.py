"""
Manual Input Node

A simple input node that allows users to enter text manually.
The text is sent downstream when the workflow executes.
"""

import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext


class ManualInputNode(BaseNode):
    """
    Manual Input Node

    Outputs text that was entered in the configuration.
    """

    def __init__(self):
        self.placeholder = "Enter text..."
        self.input_text = ""

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.placeholder = config.get("placeholder", "Enter text...")
        self.input_text = config.get("inputText", "")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Return the configured input text."""
        text = self.input_text

        if text:
            await context.log(f"Input: {text[:50]}{'...' if len(text) > 50 else ''}")
        else:
            await context.log("No input text configured", "warning")

        return {"text": text}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
