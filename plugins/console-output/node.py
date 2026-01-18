"""
Console Output Node

Displays text in the execution log panel.
"""

import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext


class ConsoleOutputNode(BaseNode):
    """
    Console Output Node

    Outputs text to the execution log panel.
    """

    def __init__(self):
        self.prefix = "[Output]"
        self.log_level = "info"

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.prefix = config.get("prefix", "[Output]")
        self.log_level = config.get("logLevel", "info")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Output the text to the log."""
        text = inputs.get("text", "")

        if text:
            message = f"{self.prefix} {text}"
            await context.log(message, self.log_level)
        else:
            await context.log(f"{self.prefix} (empty)", "debug")

        return {}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
