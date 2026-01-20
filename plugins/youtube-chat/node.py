"""
YouTube Chat Node

Fetches live chat messages from YouTube streams using the YouTube Data API v3.
"""

import sys
import asyncio
import re
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event

try:
    import httpx
except ImportError:
    httpx = None


class YouTubeChatNode(BaseNode):
    """
    YouTube Chat Node

    Fetches live chat messages from YouTube streams and emits events.
    """

    def __init__(self):
        self.video_id = None
        self.api_key = None
        self.poll_interval = 3000
        self.filter_bots = True
        self.live_chat_id = None
        self.next_page_token = None
        self.client: Optional[httpx.AsyncClient] = None
        self._polling_task: Optional[asyncio.Task] = None
        self._running = False
        self._context: Optional[NodeContext] = None
        self._last_message: Optional[Dict[str, Any]] = None

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize the YouTube API client."""
        if httpx is None:
            await context.log("httpx package not installed", "error")
            return

        self.video_id = self._extract_video_id(config.get("videoId", ""))
        self.api_key = config.get("apiKey")
        self.poll_interval = config.get("pollInterval", 3000)
        self.filter_bots = config.get("filterBots", True)
        self._context = context

        if not self.video_id:
            await context.log("Invalid YouTube video ID", "error")
            return

        if not self.api_key:
            await context.log("YouTube API key not configured", "error")
            return

        self.client = httpx.AsyncClient()

        # Get live chat ID
        try:
            self.live_chat_id = await self._get_live_chat_id()
            if self.live_chat_id:
                await context.log(f"Connected to live chat: {self.live_chat_id[:20]}...")
                self._running = True
                # Start polling in background
                self._polling_task = asyncio.create_task(self._poll_messages())
            else:
                await context.log("Could not find live chat for this video", "warning")
        except Exception as e:
            await context.log(f"Failed to connect to YouTube: {str(e)}", "error")

    def _extract_video_id(self, url_or_id: str) -> Optional[str]:
        """Extract video ID from URL or return as-is if already an ID."""
        if not url_or_id:
            return None

        # Already a video ID
        if re.match(r'^[a-zA-Z0-9_-]{11}$', url_or_id):
            return url_or_id

        # Extract from various YouTube URL formats
        patterns = [
            r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})',
        ]
        for pattern in patterns:
            match = re.search(pattern, url_or_id)
            if match:
                return match.group(1)

        return url_or_id  # Return as-is and let API validate

    async def _get_live_chat_id(self) -> Optional[str]:
        """Get the live chat ID for the video."""
        url = "https://www.googleapis.com/youtube/v3/videos"
        params = {
            "part": "liveStreamingDetails",
            "id": self.video_id,
            "key": self.api_key,
        }

        response = await self.client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        items = data.get("items", [])
        if items:
            live_details = items[0].get("liveStreamingDetails", {})
            return live_details.get("activeLiveChatId")
        return None

    async def _poll_messages(self):
        """Poll for new chat messages."""
        while self._running:
            try:
                messages = await self._fetch_messages()
                for msg in messages:
                    await self._process_message(msg)
            except Exception as e:
                if self._context:
                    await self._context.log(f"Polling error: {str(e)}", "warning")

            await asyncio.sleep(self.poll_interval / 1000)

    async def _fetch_messages(self) -> List[Dict[str, Any]]:
        """Fetch new messages from the live chat."""
        if not self.live_chat_id:
            return []

        url = "https://www.googleapis.com/youtube/v3/liveChat/messages"
        params = {
            "liveChatId": self.live_chat_id,
            "part": "snippet,authorDetails",
            "key": self.api_key,
        }
        if self.next_page_token:
            params["pageToken"] = self.next_page_token

        response = await self.client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        self.next_page_token = data.get("nextPageToken")
        return data.get("items", [])

    async def _process_message(self, item: Dict[str, Any]):
        """Process a single chat message."""
        snippet = item.get("snippet", {})
        author = item.get("authorDetails", {})

        # Filter bots
        if self.filter_bots:
            author_name = author.get("displayName", "").lower()
            if any(bot in author_name for bot in ["nightbot", "streamelements", "moobot"]):
                return

        message_type = snippet.get("type", "textMessageEvent")
        text = snippet.get("textMessageDetails", {}).get("messageText", "")

        # Build message object
        msg = {
            "id": item.get("id"),
            "text": text,
            "author": author.get("displayName", "Unknown"),
            "authorChannelId": author.get("channelId"),
            "timestamp": snippet.get("publishedAt", datetime.utcnow().isoformat()),
            "isMember": author.get("isChatSponsor", False),
            "isModerator": author.get("isChatModerator", False),
            "isOwner": author.get("isChatOwner", False),
        }

        self._last_message = msg

        # Emit appropriate event with separate fields for easy connection
        if message_type == "superChatEvent":
            super_chat = snippet.get("superChatDetails", {})
            msg["superchatAmount"] = super_chat.get("amountMicros", 0) / 1000000
            msg["superchatCurrency"] = super_chat.get("currency", "USD")
            await self._context.emit_event(Event(
                type="message.superchat",
                payload={
                    "message": msg,        # Full object for advanced use
                    "text": msg["text"],   # Just the text (string)
                    "author": msg["author"],  # Just the author name (string)
                    "amount": msg["superchatAmount"],
                    "currency": msg["superchatCurrency"],
                }
            ))
            await self._context.log(
                f"Superchat from {msg['author']}: {msg['superchatAmount']} {msg['superchatCurrency']}"
            )

        elif message_type == "memberMilestoneChatEvent":
            await self._context.emit_event(Event(
                type="message.membership",
                payload={
                    "message": msg,        # Full object for advanced use
                    "text": msg["text"],   # Just the text (string)
                    "author": msg["author"],  # Just the author name (string)
                }
            ))
            await self._context.log(f"Membership: {msg['author']}")

        else:
            await self._context.emit_event(Event(
                type="message.received",
                payload={
                    "message": msg,        # Full object for advanced use
                    "text": msg["text"],   # Just the text (string)
                    "author": msg["author"],  # Just the author name (string)
                }
            ))
            await self._context.log(f"{msg['author']}: {text[:50]}...")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """
        Return the current connection status.

        In event-driven mode, this node emits events via the background poller.
        The execute() method just returns status - it doesn't block.
        """
        if not self._running:
            await context.log("Not connected to YouTube chat", "error")
            return {
                "connected": False,
                "videoId": self.video_id,
                "message": None,
                "author": "",
                "text": ""
            }

        await context.log(f"YouTube chat active for video {self.video_id}")

        return {
            "connected": True,
            "videoId": self.video_id,
            "liveChatId": self.live_chat_id,
            "message": None,
            "author": "",
            "text": ""
        }

    async def teardown(self) -> None:
        """Clean up resources."""
        self._running = False
        if self._polling_task:
            self._polling_task.cancel()
            try:
                await self._polling_task
            except asyncio.CancelledError:
                pass
        if self.client:
            await self.client.aclose()
