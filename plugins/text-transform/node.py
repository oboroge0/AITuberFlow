"""
Text Transform Node

Transforms text with various operations.
"""

import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext


class TextTransformNode(BaseNode):
    """
    Text Transform Node

    Applies various transformations to text.
    """

    def __init__(self):
        self.operation = "template"
        self.template = "{{text}}"
        self.find = ""
        self.replace_with = ""
        self.delimiter = " "

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.operation = config.get("operation", "template")
        self.template = config.get("template", "{{text}}")
        self.find = config.get("find", "")
        self.replace_with = config.get("replaceWith", "")
        self.delimiter = config.get("delimiter", " ")

        await context.log(f"Text transform configured: {self.operation}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Transform the input text."""
        text = inputs.get("text", "")

        if not isinstance(text, str):
            text = str(text) if text is not None else ""

        result = text

        if self.operation == "uppercase":
            result = text.upper()
        elif self.operation == "lowercase":
            result = text.lower()
        elif self.operation == "trim":
            result = text.strip()
        elif self.operation == "replace":
            result = text.replace(self.find, self.replace_with)
        elif self.operation == "split_first":
            parts = text.split(self.delimiter, 1)
            result = parts[0] if parts else ""
        elif self.operation == "split_last":
            parts = text.rsplit(self.delimiter, 1)
            result = parts[-1] if parts else ""
        elif self.operation == "length":
            result = str(len(text))
        elif self.operation == "prefix":
            result = self.template + text
        elif self.operation == "suffix":
            result = text + self.template
        elif self.operation == "template":
            result = self.template.replace("{{text}}", text)

        await context.log(f"Transformed: '{text[:30]}...' -> '{result[:30]}...'")
        return {"result": result}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
