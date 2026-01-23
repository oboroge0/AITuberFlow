"""
VTube Studio WebSocket API Client

Connects to VTube Studio via WebSocket and controls avatar parameters and expressions.
Authentication tokens are cached to file for persistent sessions.
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Optional, Callable, Awaitable
from datetime import datetime

import websockets
from websockets.client import WebSocketClientProtocol

logger = logging.getLogger(__name__)

# VTS API constants
PLUGIN_NAME = "AITuberFlow"
PLUGIN_DEVELOPER = "AITuberFlow"
API_NAME = "VTubeStudioPublicAPI"
API_VERSION = "1.0"

# Token storage path
TOKEN_FILE = Path(__file__).parent.parent / "data" / "vts_token.json"


class VTubeStudioClient:
    """
    VTube Studio WebSocket API client.

    Handles connection, authentication, and parameter/hotkey control.
    """

    def __init__(self):
        self.ws: Optional[WebSocketClientProtocol] = None
        self.port: int = 8001
        self.connected: bool = False
        self.authenticated: bool = False
        self.request_id: int = 0
        self.pending_requests: dict[str, asyncio.Future] = {}
        self.expression_map: dict[str, str] = {}
        self.mouth_param: str = "MouthOpen"
        self._receive_task: Optional[asyncio.Task] = None
        self._reconnect_task: Optional[asyncio.Task] = None
        self._should_reconnect: bool = True

    @property
    def is_connected(self) -> bool:
        """Check if connected and authenticated."""
        return self.connected and self.authenticated

    def configure(
        self,
        port: int = 8001,
        mouth_param: str = "MouthOpen",
        expression_map: Optional[dict[str, str]] = None
    ):
        """Configure VTS client settings."""
        self.port = port
        self.mouth_param = mouth_param
        self.expression_map = expression_map or {
            "happy": "Happy",
            "sad": "Sad",
            "angry": "Angry",
            "surprised": "Surprised",
            "relaxed": "Relaxed",
            "neutral": "Neutral",
        }
        logger.info(f"VTS configured: port={port}, mouth_param={mouth_param}")

    async def connect(self) -> bool:
        """
        Connect to VTube Studio and authenticate.

        Returns True if connection and authentication successful.
        """
        if self.connected:
            return self.authenticated

        self._should_reconnect = True

        try:
            uri = f"ws://localhost:{self.port}"
            logger.info(f"Connecting to VTube Studio at {uri}")

            self.ws = await websockets.connect(uri)
            self.connected = True
            logger.info("Connected to VTube Studio")

            # Start receive loop
            self._receive_task = asyncio.create_task(self._receive_loop())

            # Authenticate
            success = await self._authenticate()
            if success:
                logger.info("VTube Studio authentication successful")
            else:
                logger.warning("VTube Studio authentication failed")

            return success

        except Exception as e:
            logger.error(f"Failed to connect to VTube Studio: {e}")
            self.connected = False
            self.authenticated = False
            return False

    async def disconnect(self):
        """Disconnect from VTube Studio."""
        self._should_reconnect = False

        if self._reconnect_task:
            self._reconnect_task.cancel()
            self._reconnect_task = None

        if self._receive_task:
            self._receive_task.cancel()
            self._receive_task = None

        if self.ws:
            await self.ws.close()
            self.ws = None

        self.connected = False
        self.authenticated = False
        logger.info("Disconnected from VTube Studio")

    async def set_parameter(self, param_id: str, value: float) -> bool:
        """
        Set a VTS parameter value (e.g., for lip sync).

        Args:
            param_id: Parameter ID (e.g., "MouthOpen")
            value: Value between 0.0 and 1.0

        Returns True if successful.
        """
        if not self.is_connected:
            return False

        value = max(0.0, min(1.0, value))

        try:
            await self._send_request(
                "InjectParameterDataRequest",
                {
                    "faceFound": True,
                    "mode": "set",
                    "parameterValues": [
                        {"id": param_id, "value": value}
                    ]
                }
            )
            return True
        except Exception as e:
            # Silently fail for high-frequency parameter updates
            return False

    async def set_mouth_open(self, value: float) -> bool:
        """Set mouth open parameter for lip sync."""
        return await self.set_parameter(self.mouth_param, value)

    async def trigger_hotkey(self, hotkey_id: str) -> bool:
        """
        Trigger a VTS hotkey (e.g., for expression change).

        Args:
            hotkey_id: Hotkey ID or name

        Returns True if successful.
        """
        if not self.is_connected:
            return False

        try:
            response = await self._send_request(
                "HotkeyTriggerRequest",
                {"hotkeyID": hotkey_id}
            )
            return True
        except Exception as e:
            logger.error(f"Failed to trigger hotkey {hotkey_id}: {e}")
            return False

    async def trigger_expression(self, expression: str) -> bool:
        """
        Trigger expression change using mapped hotkey.

        Args:
            expression: Expression name (e.g., "happy")

        Returns True if successful.
        """
        hotkey_id = self.expression_map.get(expression.lower())
        if not hotkey_id:
            logger.warning(f"No hotkey mapped for expression: {expression}")
            return False

        return await self.trigger_hotkey(hotkey_id)

    async def _authenticate(self) -> bool:
        """Authenticate with VTube Studio."""
        # Try cached token first
        token = self._load_token()

        if token:
            success = await self._auth_with_token(token)
            if success:
                return True
            # Token invalid, clear it
            self._clear_token()

        # Request new token
        token = await self._request_token()
        if not token:
            return False

        # Authenticate with new token
        success = await self._auth_with_token(token)
        if success:
            self._save_token(token)

        return success

    async def _request_token(self) -> Optional[str]:
        """Request authentication token from VTS (triggers user popup)."""
        try:
            logger.info("Requesting VTS authentication token (check VTube Studio for popup)")
            response = await self._send_request(
                "AuthenticationTokenRequest",
                {
                    "pluginName": PLUGIN_NAME,
                    "pluginDeveloper": PLUGIN_DEVELOPER,
                },
                timeout=60.0  # User needs time to click
            )

            if response and "data" in response:
                return response["data"].get("authenticationToken")
            return None

        except Exception as e:
            logger.error(f"Token request failed: {e}")
            return None

    async def _auth_with_token(self, token: str) -> bool:
        """Authenticate with existing token."""
        try:
            response = await self._send_request(
                "AuthenticationRequest",
                {
                    "pluginName": PLUGIN_NAME,
                    "pluginDeveloper": PLUGIN_DEVELOPER,
                    "authenticationToken": token,
                }
            )

            if response and "data" in response:
                self.authenticated = response["data"].get("authenticated", False)
                return self.authenticated
            return False

        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            return False

    def _load_token(self) -> Optional[str]:
        """Load cached token from file."""
        try:
            if TOKEN_FILE.exists():
                data = json.loads(TOKEN_FILE.read_text())
                # Check if token is for same port
                if data.get("port") == self.port:
                    return data.get("token")
        except Exception as e:
            logger.debug(f"Failed to load token: {e}")
        return None

    def _save_token(self, token: str):
        """Save token to file."""
        try:
            TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
            TOKEN_FILE.write_text(json.dumps({
                "token": token,
                "port": self.port,
                "updated_at": datetime.utcnow().isoformat()
            }, indent=2))
            logger.info("VTS token saved")
        except Exception as e:
            logger.error(f"Failed to save token: {e}")

    def _clear_token(self):
        """Clear cached token."""
        try:
            if TOKEN_FILE.exists():
                TOKEN_FILE.unlink()
        except Exception:
            pass

    async def _send_request(
        self,
        message_type: str,
        data: Optional[dict] = None,
        timeout: float = 10.0
    ) -> Optional[dict]:
        """Send request and wait for response."""
        if not self.ws:
            raise RuntimeError("Not connected")

        self.request_id += 1
        request_id = f"req_{self.request_id}_{int(datetime.utcnow().timestamp() * 1000)}"

        message = {
            "apiName": API_NAME,
            "apiVersion": API_VERSION,
            "requestID": request_id,
            "messageType": message_type,
        }
        if data:
            message["data"] = data

        # Create future for response
        future: asyncio.Future = asyncio.Future()
        self.pending_requests[request_id] = future

        try:
            await self.ws.send(json.dumps(message))
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(f"Request {message_type} timed out")
            return None
        finally:
            self.pending_requests.pop(request_id, None)

    async def _receive_loop(self):
        """Receive and dispatch messages from VTS."""
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    request_id = data.get("requestID")

                    if request_id and request_id in self.pending_requests:
                        self.pending_requests[request_id].set_result(data)

                except json.JSONDecodeError:
                    logger.warning("Failed to parse VTS message")

        except websockets.exceptions.ConnectionClosed:
            logger.info("VTS connection closed")
            self.connected = False
            self.authenticated = False

            # Attempt reconnect
            if self._should_reconnect:
                self._reconnect_task = asyncio.create_task(self._reconnect())

        except Exception as e:
            logger.error(f"VTS receive error: {e}")
            self.connected = False
            self.authenticated = False

    async def _reconnect(self):
        """Attempt to reconnect after disconnection."""
        await asyncio.sleep(3.0)

        if self._should_reconnect and not self.connected:
            logger.info("Attempting to reconnect to VTS...")
            await self.connect()


# Global client instance
vts_client = VTubeStudioClient()
