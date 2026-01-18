"""
Delay Node

Adds a time delay before passing data downstream.
"""

import sys
import asyncio
import random
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext


class DelayNode(BaseNode):
    """
    Delay Node

    Introduces a configurable delay before passing data through.
    """

    def __init__(self):
        self.delay_ms = 1000
        self.randomize = False
        self.random_min = 500
        self.random_max = 2000

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.delay_ms = config.get("delayMs", 1000)
        self.randomize = config.get("randomize", False)
        self.random_min = config.get("randomMin", 500)
        self.random_max = config.get("randomMax", 2000)

        if self.randomize:
            await context.log(f"Delay configured: {self.random_min}-{self.random_max}ms (random)")
        else:
            await context.log(f"Delay configured: {self.delay_ms}ms")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Wait for the configured delay, then pass through input."""
        input_data = inputs.get("input")

        # Calculate delay
        if self.randomize:
            delay = random.randint(self.random_min, self.random_max)
        else:
            delay = self.delay_ms

        await context.log(f"Waiting {delay}ms...")
        await asyncio.sleep(delay / 1000)
        await context.log(f"Delay complete")

        return {"output": input_data}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
