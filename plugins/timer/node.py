"""
Timer Node

Triggers at regular intervals.
"""

import sys
from datetime import datetime
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext


class TimerNode(BaseNode):
    """
    Timer Node

    Triggers at regular intervals.
    Note: For MVP, this executes once and returns the first tick.
    Full interval functionality requires streaming support.
    """

    def __init__(self):
        self.interval_ms = 5000
        self.max_ticks = 0
        self.immediate = True
        self.tick_count = 0

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.interval_ms = config.get("intervalMs", 5000)
        self.max_ticks = config.get("maxTicks", 0)
        self.immediate = config.get("immediate", True)
        self.tick_count = 0

        await context.log(f"Timer configured: interval={self.interval_ms}ms")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Generate a timer tick."""
        self.tick_count += 1

        timestamp = datetime.utcnow().isoformat()

        await context.log(f"Timer tick #{self.tick_count}")

        return {
            "tick": self.tick_count,
            "timestamp": timestamp
        }

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
