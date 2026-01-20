"""
Timer Node

Triggers at regular intervals using event-driven architecture.
"""

import sys
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event


class TimerNode(BaseNode):
    """
    Timer Node

    Triggers at regular intervals and emits timer events.
    In event-driven mode, the timer runs in the background and emits events.
    """

    def __init__(self):
        self.interval_ms = 5000
        self.max_ticks = 0
        self.immediate = True
        self.tick_count = 0
        self._running = False
        self._context: Optional[NodeContext] = None
        self._timer_task: Optional[asyncio.Task] = None

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize and start the timer."""
        self.interval_ms = config.get("intervalMs", 5000)
        self.max_ticks = config.get("maxTicks", 0)
        self.immediate = config.get("immediate", True)
        self.tick_count = 0
        self._context = context
        self._running = True

        await context.log(f"Timer configured: interval={self.interval_ms}ms")

        # Start the timer loop in the background
        self._timer_task = asyncio.create_task(self._timer_loop())

    async def _timer_loop(self):
        """Background timer loop that emits tick events."""
        # Emit immediately if configured
        if self.immediate:
            await self._emit_tick()

        while self._running:
            # Check max ticks limit
            if self.max_ticks > 0 and self.tick_count >= self.max_ticks:
                if self._context:
                    await self._context.log(f"Timer reached max ticks ({self.max_ticks})")
                break

            # Wait for interval
            await asyncio.sleep(self.interval_ms / 1000)

            if not self._running:
                break

            await self._emit_tick()

    async def _emit_tick(self):
        """Emit a single timer tick event."""
        self.tick_count += 1
        timestamp = datetime.utcnow().isoformat()

        if self._context:
            await self._context.log(f"Timer tick #{self.tick_count}")
            await self._context.emit_event(Event(
                type="timer.tick",
                payload={
                    "tick": self.tick_count,
                    "timestamp": timestamp
                }
            ))

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """
        Return the current timer status.

        In event-driven mode, this node emits events via the background timer loop.
        The execute() method just returns status - it doesn't block.
        """
        return {
            "running": self._running,
            "tickCount": self.tick_count,
            "intervalMs": self.interval_ms,
            "maxTicks": self.max_ticks
        }

    async def teardown(self) -> None:
        """Stop the timer and clean up."""
        self._running = False
        if self._timer_task:
            self._timer_task.cancel()
            try:
                await self._timer_task
            except asyncio.CancelledError:
                pass
