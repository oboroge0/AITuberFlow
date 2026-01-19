"""
End Node

Workflow exit point - marks the end of execution.
"""

import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event


class EndNode(BaseNode):
    """
    End Node

    Exit point for workflow execution.
    """

    def __init__(self):
        self.message = "Workflow completed"

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.message = config.get("message", "Workflow completed")
        await context.log("End node initialized")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """End workflow execution."""
        input_value = inputs.get("input", None)

        await context.log(f"Workflow ended: {self.message}")

        # Emit workflow end event
        await context.emit_event(Event(
            type="workflow.ended",
            payload={
                "message": self.message,
                "finalValue": input_value
            }
        ))

        return {}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
