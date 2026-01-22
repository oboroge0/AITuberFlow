"""
OBS Source Toggle Node

Show or hide OBS sources via WebSocket connection.
Requires OBS Studio 28+ with WebSocket server enabled.
"""

import sys
from pathlib import Path
from typing import Optional

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext

# Try to import obsws-python
try:
    import obsws_python as obs
    OBS_AVAILABLE = True
except ImportError:
    OBS_AVAILABLE = False


class OBSSourceToggleNode(BaseNode):
    """
    OBS Source Toggle Node

    Shows or hides OBS sources using the obs-websocket protocol.
    """

    def __init__(self):
        self.host = "localhost"
        self.port = 4455
        self.password = ""
        self.scene_name = ""
        self.source_name = ""
        self.action = "toggle"
        self.client: Optional[obs.ReqClient] = None

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize OBS WebSocket connection."""
        if not OBS_AVAILABLE:
            await context.log(
                "obsws-python not installed. Run: pip install obsws-python",
                level="error"
            )
            return

        self.host = config.get("host", "localhost")
        self.port = config.get("port", 4455)
        self.password = config.get("password", "")
        self.scene_name = config.get("scene_name", "")
        self.source_name = config.get("source_name", "")
        self.action = config.get("action", "toggle")

        await context.log(
            f"OBS Source Toggle configured: {self.source_name} ({self.action})"
        )

        # Try to connect
        try:
            self.client = obs.ReqClient(
                host=self.host,
                port=self.port,
                password=self.password if self.password else None,
                timeout=5
            )
            await context.log("Connected to OBS WebSocket")
        except Exception as e:
            await context.log(f"Failed to connect to OBS: {e}", level="error")
            self.client = None

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Toggle source visibility."""
        if not OBS_AVAILABLE:
            return {
                "success": False,
                "visible": False,
                "source_name": self.source_name
            }

        if not self.client:
            # Try to reconnect
            try:
                self.client = obs.ReqClient(
                    host=self.host,
                    port=self.port,
                    password=self.password if self.password else None,
                    timeout=5
                )
            except Exception as e:
                await context.log(f"Failed to connect to OBS: {e}", level="error")
                return {
                    "success": False,
                    "visible": False,
                    "source_name": self.source_name
                }

        if not self.source_name:
            await context.log("No source name specified", level="warning")
            return {
                "success": False,
                "visible": False,
                "source_name": ""
            }

        try:
            # Get scene name (use current if not specified)
            scene_name = self.scene_name
            if not scene_name:
                current = self.client.get_current_program_scene()
                scene_name = current.scene_name

            # Get scene item ID for the source
            scene_item_id = self._get_scene_item_id(scene_name, self.source_name)

            if scene_item_id is None:
                await context.log(
                    f"Source '{self.source_name}' not found in scene '{scene_name}'",
                    level="error"
                )
                return {
                    "success": False,
                    "visible": False,
                    "source_name": self.source_name
                }

            # Get current visibility
            current_state = self.client.get_scene_item_enabled(
                scene_name=scene_name,
                scene_item_id=scene_item_id
            )
            current_visible = current_state.scene_item_enabled

            # Determine target visibility
            input_visible = inputs.get("visible")

            if input_visible is not None:
                # Input overrides action
                target_visible = bool(input_visible)
            elif self.action == "show":
                target_visible = True
            elif self.action == "hide":
                target_visible = False
            else:  # toggle
                target_visible = not current_visible

            # Set visibility
            self.client.set_scene_item_enabled(
                scene_name=scene_name,
                scene_item_id=scene_item_id,
                scene_item_enabled=target_visible
            )

            action_word = "shown" if target_visible else "hidden"
            await context.log(f"Source '{self.source_name}' {action_word}")

            return {
                "success": True,
                "visible": target_visible,
                "source_name": self.source_name
            }

        except Exception as e:
            await context.log(f"Failed to toggle source: {e}", level="error")
            return {
                "success": False,
                "visible": False,
                "source_name": self.source_name
            }

    def _get_scene_item_id(self, scene_name: str, source_name: str) -> Optional[int]:
        """Get the scene item ID for a source in a scene."""
        try:
            items = self.client.get_scene_item_list(scene_name=scene_name)
            for item in items.scene_items:
                if item.get("sourceName") == source_name:
                    return item.get("sceneItemId")
            return None
        except:
            return None

    async def teardown(self) -> None:
        """Disconnect from OBS."""
        if self.client:
            try:
                self.client.disconnect()
            except:
                pass
            self.client = None
