"""
ForEach Node

Iterates over each item in a list or text separated by a delimiter.
"""

import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event


class ForEachNode(BaseNode):
    """
    ForEach Node

    Iterates over items in a list or text.
    """

    def __init__(self):
        self.separator = "\n"
        self.items = []
        self.current_index = 0

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        separator = config.get("separator", "\\n")
        # Handle escape sequences
        if separator == "\\n":
            self.separator = "\n"
        elif separator == "\\t":
            self.separator = "\t"
        else:
            self.separator = separator

        self.items = []
        self.current_index = 0

        await context.log(f"ForEach node initialized")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Execute foreach iteration."""
        list_input = inputs.get("list", "")

        # Initialize items on first call or if new input
        if not self.items or self.current_index == 0:
            if isinstance(list_input, list):
                self.items = list_input
            elif isinstance(list_input, str):
                self.items = list_input.split(self.separator)
                self.items = [item.strip() for item in self.items if item.strip()]
            else:
                self.items = [list_input] if list_input else []

            self.current_index = 0
            await context.log(f"ForEach processing {len(self.items)} items")

        # Check if we have more items
        if self.current_index < len(self.items):
            current_item = self.items[self.current_index]
            current_index = self.current_index
            self.current_index += 1

            await context.log(f"ForEach item {current_index + 1}/{len(self.items)}: {str(current_item)[:50]}")

            # Emit iteration event
            await context.emit_event(Event(
                type="foreach.iteration",
                payload={
                    "item": current_item,
                    "index": current_index,
                    "total": len(self.items)
                }
            ))

            return {
                "item": current_item,
                "index": current_index,
                "done": None
            }
        else:
            # Done iterating
            await context.log("ForEach completed all items")

            # Reset for next run
            self.items = []
            self.current_index = 0

            return {
                "item": None,
                "index": None,
                "done": True
            }

    async def teardown(self) -> None:
        """Reset state."""
        self.items = []
        self.current_index = 0
