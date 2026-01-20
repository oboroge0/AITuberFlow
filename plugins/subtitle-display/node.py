"""
Subtitle Display Node

Displays text as subtitle overlay for streaming.
Emits subtitle events that the frontend subtitle layer captures.
"""

from aituber_flow_sdk import BaseNode, NodeContext, Event
from typing import Optional


class SubtitleDisplayNode(BaseNode):
    """Subtitle display node - shows text as overlay subtitle."""

    def __init__(self):
        self.style: str = "default"
        self.position: str = "bottom-center"
        self.font_size: int = 24
        self.font_color: str = "#ffffff"
        self.background_color: str = "rgba(0, 0, 0, 0.7)"
        self.show_speaker: bool = False
        self.animation: str = "fade"
        self.duration: int = 0

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize subtitle display with configuration."""
        self.style = config.get("style", "default")
        self.position = config.get("position", "bottom-center")
        self.font_size = config.get("font_size", 24)
        self.font_color = config.get("font_color", "#ffffff")
        self.background_color = config.get("background_color", "rgba(0, 0, 0, 0.7)")
        self.show_speaker = config.get("show_speaker", False)
        self.animation = config.get("animation", "fade")
        self.duration = config.get("duration", 0)

        await context.log(
            f"Subtitle display initialized: position={self.position}, style={self.style}"
        )

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """
        Display text as subtitle.

        Inputs:
            - text: Text to display as subtitle

        Outputs:
            - text: Pass-through of input text
        """
        text = inputs.get("text", "")

        if not text:
            return {"text": ""}

        # Get character name if show_speaker is enabled
        speaker = ""
        if self.show_speaker and context.character:
            speaker = context.character.get("name", "")

        # Build subtitle payload
        payload = {
            "text": text,
            "speaker": speaker,
            "style": {
                "preset": self.style,
                "position": self.position,
                "fontSize": self.font_size,
                "fontColor": self.font_color,
                "backgroundColor": self.background_color,
                "animation": self.animation,
            },
            "duration": self.duration,
        }

        await context.emit_event(Event(type="subtitle", payload=payload))
        await context.log(f"Subtitle displayed: {text[:50]}{'...' if len(text) > 50 else ''}")

        return {"text": text}

    async def teardown(self) -> None:
        """Cleanup on workflow stop."""
        pass
