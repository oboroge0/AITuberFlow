"""
Avatar Configuration Node

Static configuration for avatar display.
Sets VRM model, idle animation, and renderer type.

This node only emits configuration on setup - it has no inputs or outputs.
Avatar control (expression, motion, lip-sync) is handled by dedicated nodes
that emit events directly.
"""

from aituber_flow_sdk import BaseNode, NodeContext, Event


class AvatarConfigurationNode(BaseNode):
    """Static avatar configuration node."""

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize and emit avatar configuration."""
        renderer = config.get("renderer", "vrm")
        model_url = config.get("model_url", "/models/avatar.vrm")
        idle_animation = config.get("idle_animation", "")
        vtube_port = config.get("vtube_port", 8001)
        vtube_mouth_param = config.get("vtube_mouth_param", "MouthOpen")
        vtube_expression_map = config.get("vtube_expression_map", "{}")
        png_config = config.get("png_config", "{}")

        await context.log(
            f"Avatar Configuration: renderer={renderer}, model={model_url}"
        )

        # Emit avatar configuration to frontend
        await context.emit_event(
            Event(
                type="avatar.update",
                payload={
                    "renderer": renderer,
                    "model_url": model_url,
                    "idle_animation": idle_animation,
                    "vtube_port": vtube_port,
                    "vtube_mouth_param": vtube_mouth_param,
                    "vtube_expression_map": vtube_expression_map,
                    "png_config": png_config,
                },
            )
        )

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """No-op - this node only configures on setup."""
        return {}

    async def teardown(self) -> None:
        """Cleanup on workflow stop."""
        pass
