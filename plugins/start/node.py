"""
Start Node

Workflow entry point - marks the beginning of execution.
"""

import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event


class StartNode(BaseNode):
    """
    Start Node

    Entry point for workflow execution.
    """

    def __init__(self):
        self.auto_start = True

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.auto_start = config.get("autoStart", True)
        await context.log("Start node initialized")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Trigger workflow start."""
        await context.log("Workflow started")

        # Emit workflow start event
        await context.emit_event(Event(
            type="workflow.started",
            payload={"autoStart": self.auto_start}
        ))

        return {"trigger": True}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
