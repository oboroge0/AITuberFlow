"""
Switch Node

Conditional routing based on input values.
"""

import sys
import re
from pathlib import Path
from typing import Any, Optional

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext


class SwitchNode(BaseNode):
    """
    Switch Node

    Routes data based on conditional evaluation.
    """

    def __init__(self):
        self.mode = "truthy"
        self.compare_value = ""
        self.case_sensitive = False

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.mode = config.get("mode", "truthy")
        self.compare_value = config.get("compareValue", "")
        self.case_sensitive = config.get("caseSensitive", False)
        await context.log(f"Switch configured: mode={self.mode}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Evaluate condition and route accordingly."""
        value = inputs.get("value")
        data = inputs.get("data", value)

        result = self._evaluate(value)

        if result:
            await context.log(f"Condition TRUE: routing to 'true' output")
            return {"true": data, "false": None, "match": data}
        else:
            await context.log(f"Condition FALSE: routing to 'false' output")
            return {"true": None, "false": data, "match": None}

    def _evaluate(self, value: Any) -> bool:
        """Evaluate the condition based on mode."""
        if self.mode == "truthy":
            return bool(value)

        elif self.mode == "equals":
            return self._compare_equal(value, self.compare_value)

        elif self.mode == "contains":
            return self._compare_contains(value, self.compare_value)

        elif self.mode == "regex":
            return self._compare_regex(value, self.compare_value)

        elif self.mode == "gt":
            return self._compare_gt(value, self.compare_value)

        elif self.mode == "lt":
            return self._compare_lt(value, self.compare_value)

        return bool(value)

    def _compare_equal(self, value: Any, compare: str) -> bool:
        """Check equality."""
        str_value = str(value) if value is not None else ""
        if self.case_sensitive:
            return str_value == compare
        return str_value.lower() == compare.lower()

    def _compare_contains(self, value: Any, compare: str) -> bool:
        """Check if value contains compare string."""
        str_value = str(value) if value is not None else ""
        if self.case_sensitive:
            return compare in str_value
        return compare.lower() in str_value.lower()

    def _compare_regex(self, value: Any, pattern: str) -> bool:
        """Check regex match."""
        str_value = str(value) if value is not None else ""
        try:
            flags = 0 if self.case_sensitive else re.IGNORECASE
            return bool(re.search(pattern, str_value, flags))
        except re.error:
            return False

    def _compare_gt(self, value: Any, compare: str) -> bool:
        """Check if value is greater than compare."""
        try:
            return float(value) > float(compare)
        except (ValueError, TypeError):
            return False

    def _compare_lt(self, value: Any, compare: str) -> bool:
        """Check if value is less than compare."""
        try:
            return float(value) < float(compare)
        except (ValueError, TypeError):
            return False

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
