"""
Motion Trigger Node - Trigger avatar expressions and motions

Designed to output to Avatar Controller for centralized avatar control.
Can also emit events directly if emit_events is enabled.
"""

from aituber_flow_sdk import BaseNode, NodeContext, Event


class MotionTriggerNode(BaseNode):
    """Node that triggers configured expression/motion when receiving any input."""

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize the node with configuration."""
        self.expression = config.get("expression", "")
        self.intensity = float(config.get("intensity", 0.8))
        self.motion_url = config.get("motion_url", "")
        self.motion = config.get("motion", "")  # Legacy support
        self.emit_events = config.get("emit_events", True)

        motion_desc = self.motion_url or self.motion or "none"
        await context.log(
            f"Motion Trigger initialized - Expression: {self.expression or 'none'}, "
            f"Motion: {motion_desc}"
        )

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Trigger expression/motion when any input is received."""
        trigger_input = inputs.get("trigger")

        result = {
            "expression": self.expression if self.expression else None,
            "intensity": self.intensity if self.expression else None,
            "motion_url": self.motion_url if self.motion_url else None,
            "motion": self.motion if self.motion else None,  # Legacy
            "passthrough": trigger_input,
        }

        # Direct event emission (optional, disabled by default)
        if self.emit_events:
            # Emit expression event if configured
            if self.expression:
                await context.emit_event(
                    Event(
                        type="avatar.expression",
                        payload={
                            "expression": self.expression,
                            "intensity": self.intensity,
                        },
                    )
                )
                await context.log(
                    f"Emitted expression: {self.expression} (intensity: {self.intensity})"
                )

            # Emit motion event if configured (motion_url takes priority)
            if self.motion_url:
                await context.emit_event(
                    Event(
                        type="avatar.motion",
                        payload={"motion_url": self.motion_url},
                    )
                )
                await context.log(f"Emitted motion: {self.motion_url}")
            elif self.motion:
                await context.emit_event(
                    Event(
                        type="avatar.motion",
                        payload={"motion": self.motion},
                    )
                )
                await context.log(f"Emitted motion (legacy): {self.motion}")

        return result

    async def teardown(self) -> None:
        """Cleanup when node is stopped."""
        pass
