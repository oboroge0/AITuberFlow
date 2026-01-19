"""
Loop Node

Iterates execution a specified number of times or while a condition is true.
"""

import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event


class LoopNode(BaseNode):
    """
    Loop Node

    Iterates workflow execution based on count, condition, or infinitely.
    """

    def __init__(self):
        self.mode = "count"
        self.count = 3
        self.condition = ""
        self.max_iterations = 100
        self.current_iteration = 0

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.mode = config.get("mode", "count")
        self.count = config.get("count", 3)
        self.condition = config.get("condition", "")
        self.max_iterations = config.get("maxIterations", 100)
        self.current_iteration = 0

        await context.log(f"Loop node initialized: mode={self.mode}, count={self.count}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Execute loop iteration."""
        input_value = inputs.get("input", inputs.get("loopback"))

        self.current_iteration += 1

        # Check safety limit
        if self.current_iteration > self.max_iterations:
            await context.log(f"Loop reached max iterations ({self.max_iterations})", "warning")
            return {"done": input_value, "loop": None}

        should_continue = False

        if self.mode == "count":
            should_continue = self.current_iteration <= self.count
        elif self.mode == "while":
            # Simple condition evaluation (for basic cases)
            try:
                # Replace template variables
                condition = self.condition.replace("{{value}}", str(input_value))
                condition = condition.replace("{{iteration}}", str(self.current_iteration))
                should_continue = eval(condition)
            except Exception as e:
                await context.log(f"Condition evaluation error: {e}", "error")
                should_continue = False
        elif self.mode == "infinite":
            should_continue = True

        await context.log(f"Loop iteration {self.current_iteration}: continue={should_continue}")

        # Emit loop event
        await context.emit_event(Event(
            type="loop.iteration",
            payload={
                "iteration": self.current_iteration,
                "continue": should_continue,
                "value": input_value
            }
        ))

        if should_continue:
            return {"loop": input_value, "done": None}
        else:
            # Reset for next run
            self.current_iteration = 0
            return {"done": input_value, "loop": None}

    async def teardown(self) -> None:
        """Reset iteration counter."""
        self.current_iteration = 0
