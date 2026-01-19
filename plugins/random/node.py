"""
Random Node

Generates random values.
"""

import sys
import random
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext


class RandomNode(BaseNode):
    """
    Random Node

    Generates random numbers, choices, or boolean values.
    """

    def __init__(self):
        self.mode = "number"
        self.min_val = 0
        self.max_val = 100
        self.choices = []
        self.true_probability = 50

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.mode = config.get("mode", "number")
        self.min_val = config.get("min", 0)
        self.max_val = config.get("max", 100)
        self.true_probability = config.get("trueProbability", 50)

        # Parse choices from comma-separated string
        choices_str = config.get("choices", "")
        if choices_str:
            self.choices = [c.strip() for c in choices_str.split(",") if c.strip()]
        else:
            self.choices = []

        await context.log(f"Random configured: mode={self.mode}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Generate a random value."""
        value = None

        if self.mode == "number":
            if isinstance(self.min_val, float) or isinstance(self.max_val, float):
                value = random.uniform(self.min_val, self.max_val)
            else:
                value = random.randint(int(self.min_val), int(self.max_val))
            await context.log(f"Random number: {value}")

        elif self.mode == "choice":
            if self.choices:
                value = random.choice(self.choices)
                await context.log(f"Random choice: {value}")
            else:
                value = ""
                await context.log("No choices available", "warning")

        elif self.mode == "boolean":
            value = random.random() * 100 < self.true_probability
            await context.log(f"Random boolean: {value}")

        return {"value": value}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
