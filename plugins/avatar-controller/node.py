"""
Avatar Controller Node

Core avatar controller that receives expression, mouth, and motion inputs
and emits corresponding avatar events to the frontend.

This node does NOT perform emotion analysis or lip sync calculation.
Those are handled by separate dedicated nodes (emotion-analyzer, lip-sync).
"""

from aituber_flow_sdk import BaseNode, NodeContext, Event
from typing import Optional


class AvatarControllerNode(BaseNode):
    """Avatar controller node - emits avatar events based on inputs."""

    def __init__(self):
        self.renderer: str = "vrm"
        self.model_url: str = ""
        self.current_expression: str = "neutral"
        self.current_intensity: float = 0.0

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize avatar controller with configuration."""
        self.renderer = config.get("renderer", "vrm")
        self.model_url = config.get("model_url", "/models/avatar.vrm")
        self.idle_animation = config.get("idle_animation", "")
        self.vtube_port = config.get("vtube_port", 8001)
        self.png_config = config.get("png_config", "{}")

        await context.log(
            f"Avatar controller initialized: renderer={self.renderer}, model={self.model_url}"
        )

        # Emit initial avatar configuration
        await context.emit_event(
            Event(
                type="avatar.update",
                payload={
                    "renderer": self.renderer,
                    "model_url": self.model_url,
                    "idle_animation": self.idle_animation,
                    "vtube_port": self.vtube_port,
                    "png_config": self.png_config,
                },
            )
        )

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """
        Process avatar control inputs and emit events.

        Inputs:
            - expression: Expression name (happy, sad, angry, surprised, relaxed, neutral)
            - intensity: Expression intensity (0.0 - 1.0)
            - mouth: Mouth open value (0.0 - 1.0)
            - motion: Motion/animation name to trigger
        """
        expression = inputs.get("expression")
        intensity = inputs.get("intensity", 0.5)
        mouth = inputs.get("mouth")
        motion = inputs.get("motion")

        events_emitted = []

        # Handle expression change
        if expression and expression != self.current_expression:
            self.current_expression = expression
            self.current_intensity = float(intensity) if intensity else 0.5

            await context.emit_event(
                Event(
                    type="avatar.expression",
                    payload={
                        "expression": expression,
                        "intensity": self.current_intensity,
                    },
                )
            )
            events_emitted.append(f"expression:{expression}")
            await context.log(
                f"Expression set: {expression} (intensity: {self.current_intensity:.2f})"
            )

        # Handle direct mouth control (single value, not streaming)
        if mouth is not None:
            mouth_value = max(0.0, min(1.0, float(mouth)))
            await context.emit_event(
                Event(type="avatar.mouth", payload={"value": mouth_value})
            )
            events_emitted.append(f"mouth:{mouth_value:.2f}")

        # Handle motion trigger
        if motion:
            await context.emit_event(
                Event(type="avatar.motion", payload={"motion": motion})
            )
            events_emitted.append(f"motion:{motion}")
            await context.log(f"Motion triggered: {motion}")

        status = ", ".join(events_emitted) if events_emitted else "no changes"
        return {"status": status}

    async def on_event(self, event: Event, context: NodeContext) -> Optional[dict]:
        """
        Handle incoming events (e.g., avatar.mouth from lip-sync node).

        This allows real-time mouth sync from the lip-sync node's streaming output.
        """
        if event.type == "avatar.mouth":
            # Forward the mouth event (already emitted by lip-sync, just pass through)
            # This is useful if we need to intercept/modify values
            pass

        return None

    async def teardown(self) -> None:
        """Cleanup on workflow stop."""
        pass
