"""
OBS Scene Switch Node

Switch OBS scenes via WebSocket connection.
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


class OBSSceneSwitchNode(BaseNode):
    """
    OBS Scene Switch Node

    Switches OBS scenes using the obs-websocket protocol.
    """

    def __init__(self):
        self.host = "localhost"
        self.port = 4455
        self.password = ""
        self.scene_name = ""
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

        await context.log(f"OBS Scene Switch configured: {self.host}:{self.port}")

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
        """Switch to the specified scene."""
        if not OBS_AVAILABLE:
            return {
                "success": False,
                "current_scene": "",
                "scenes": []
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
                    "current_scene": "",
                    "scenes": []
                }

        # Get target scene name (input overrides config)
        target_scene = inputs.get("scene_name") or self.scene_name

        if not target_scene:
            await context.log("No scene name specified", level="warning")
            return {
                "success": False,
                "current_scene": "",
                "scenes": []
            }

        try:
            # Get available scenes
            scene_list = self.client.get_scene_list()
            scenes = [s["sceneName"] for s in scene_list.scenes]

            # Switch scene
            self.client.set_current_program_scene(target_scene)
            await context.log(f"Switched to scene: {target_scene}")

            # Get current scene to confirm
            current = self.client.get_current_program_scene()
            current_scene = current.scene_name

            return {
                "success": True,
                "current_scene": current_scene,
                "scenes": scenes
            }

        except Exception as e:
            await context.log(f"Failed to switch scene: {e}", level="error")

            # Try to get current state even if switch failed
            try:
                scene_list = self.client.get_scene_list()
                scenes = [s["sceneName"] for s in scene_list.scenes]
                current = self.client.get_current_program_scene()
                return {
                    "success": False,
                    "current_scene": current.scene_name,
                    "scenes": scenes
                }
            except:
                return {
                    "success": False,
                    "current_scene": "",
                    "scenes": []
                }

    async def teardown(self) -> None:
        """Disconnect from OBS."""
        if self.client:
            try:
                self.client.disconnect()
            except:
                pass
            self.client = None
