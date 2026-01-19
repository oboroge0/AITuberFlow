"""
Twitch Chat Node

Fetches live chat messages from Twitch streams via IRC.
"""

import sys
import asyncio
import re
import socket
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event


class TwitchChatNode(BaseNode):
    """
    Twitch Chat Node

    Fetches live chat messages from Twitch streams via IRC.
    """

    TWITCH_IRC_SERVER = "irc.chat.twitch.tv"
    TWITCH_IRC_PORT = 6667

    def __init__(self):
        self.channel = None
        self.oauth_token = None
        self.filter_bots = True
        self._socket: Optional[socket.socket] = None
        self._running = False
        self._context: Optional[NodeContext] = None
        self._last_message: Optional[Dict[str, Any]] = None
        self._listen_task: Optional[asyncio.Task] = None

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize the Twitch IRC connection."""
        self.channel = config.get("channel", "").lower().strip()
        self.oauth_token = config.get("oauthToken", "")
        self.filter_bots = config.get("filterBots", True)
        self._context = context

        if not self.channel:
            await context.log("Channel name not configured", "error")
            return

        # Add # prefix if not present
        if not self.channel.startswith("#"):
            self.channel = f"#{self.channel}"

        try:
            await self._connect()
            self._running = True
            self._listen_task = asyncio.create_task(self._listen_messages())
            await context.log(f"Connected to Twitch chat: {self.channel}")
        except Exception as e:
            await context.log(f"Failed to connect to Twitch: {str(e)}", "error")

    async def _connect(self):
        """Connect to Twitch IRC."""
        self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._socket.setblocking(False)

        loop = asyncio.get_event_loop()
        await loop.sock_connect(self._socket, (self.TWITCH_IRC_SERVER, self.TWITCH_IRC_PORT))

        # Authenticate (anonymous if no token)
        if self.oauth_token:
            await self._send(f"PASS oauth:{self.oauth_token}")
            await self._send("NICK justinfan12345")  # Anonymous read-only
        else:
            await self._send("NICK justinfan12345")  # Anonymous read-only

        await self._send(f"JOIN {self.channel}")

        # Request capabilities for tags
        await self._send("CAP REQ :twitch.tv/tags twitch.tv/commands")

    async def _send(self, message: str):
        """Send a message to Twitch IRC."""
        if self._socket:
            loop = asyncio.get_event_loop()
            await loop.sock_sendall(self._socket, f"{message}\r\n".encode("utf-8"))

    async def _listen_messages(self):
        """Listen for incoming messages."""
        buffer = ""
        loop = asyncio.get_event_loop()

        while self._running:
            try:
                data = await loop.sock_recv(self._socket, 4096)
                if not data:
                    break

                buffer += data.decode("utf-8", errors="ignore")
                lines = buffer.split("\r\n")
                buffer = lines.pop()

                for line in lines:
                    await self._process_line(line)

            except Exception as e:
                if self._running and self._context:
                    await self._context.log(f"IRC error: {str(e)}", "warning")
                await asyncio.sleep(1)

    async def _process_line(self, line: str):
        """Process a single IRC line."""
        if not line:
            return

        # Respond to PING to stay connected
        if line.startswith("PING"):
            await self._send(f"PONG {line[5:]}")
            return

        # Parse PRIVMSG (chat messages)
        privmsg_match = re.match(
            r"(?:@([^ ]+) )?:([^!]+)![^@]+@[^ ]+ PRIVMSG (#[^ ]+) :(.+)",
            line
        )

        if privmsg_match:
            tags_str, username, channel, text = privmsg_match.groups()
            tags = self._parse_tags(tags_str or "")

            # Filter bots
            if self.filter_bots:
                if username.lower() in ["nightbot", "streamelements", "moobot", "streamlabs"]:
                    return

            msg = {
                "id": tags.get("id", ""),
                "text": text,
                "author": tags.get("display-name", username),
                "authorId": tags.get("user-id", ""),
                "timestamp": datetime.utcnow().isoformat(),
                "isMod": tags.get("mod") == "1",
                "isSubscriber": tags.get("subscriber") == "1",
                "isBroadcaster": tags.get("badges", "").find("broadcaster") >= 0,
            }

            self._last_message = msg

            # Emit event
            if self._context:
                await self._context.emit_event(Event(
                    type="message.received",
                    payload={"message": msg}
                ))
                await self._context.log(f"{msg['author']}: {text[:50]}...")

    def _parse_tags(self, tags_str: str) -> Dict[str, str]:
        """Parse IRC tags string into a dictionary."""
        tags = {}
        if tags_str:
            for tag in tags_str.split(";"):
                if "=" in tag:
                    key, value = tag.split("=", 1)
                    tags[key] = value
        return tags

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Wait for and return the next chat message."""
        if not self._running:
            await context.log("Not connected to Twitch", "error")
            return {"message": None, "author": "", "text": ""}

        # Clear any previous message
        self._last_message = None

        await context.log("Waiting for chat message...")

        # Wait for a message with timeout
        timeout = 300  # 5 minutes
        elapsed = 0
        while self._running and elapsed < timeout:
            if self._last_message:
                msg = self._last_message
                return {
                    "message": msg,
                    "author": msg.get("author", ""),
                    "text": msg.get("text", ""),
                }
            await asyncio.sleep(0.1)
            elapsed += 0.1

        await context.log("Timeout waiting for chat message", "warning")
        return {"message": None, "author": "", "text": ""}

    async def teardown(self) -> None:
        """Clean up resources."""
        self._running = False
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
        if self._socket:
            try:
                await self._send("QUIT")
                self._socket.close()
            except Exception:
                pass
