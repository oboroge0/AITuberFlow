"""
Discord Chat Node

Receives messages from Discord channels using discord.py.
"""

import sys
import asyncio
from pathlib import Path
from typing import Optional, List, Set
from datetime import datetime

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event

try:
    import discord
    from discord import Intents
except ImportError:
    discord = None


class DiscordChatNode(BaseNode):
    """
    Discord Chat Node

    Receives messages from Discord channels and emits events.
    """

    def __init__(self):
        self.bot_token = None
        self.channel_ids: Set[int] = set()
        self.filter_bots = True
        self.mention_only = False
        self.client: Optional[discord.Client] = None
        self._running = False
        self._context: Optional[NodeContext] = None
        self._bot_task: Optional[asyncio.Task] = None
        self._last_message: Optional[dict] = None

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize the Discord client."""
        if discord is None:
            await context.log("discord.py package not installed. Run: pip install discord.py", "error")
            return

        self.bot_token = config.get("botToken", "")
        self.filter_bots = config.get("filterBots", True)
        self.mention_only = config.get("mentionOnly", False)
        self._context = context

        # Parse channel IDs
        channel_ids_str = config.get("channelIds", "")
        if channel_ids_str:
            try:
                self.channel_ids = set(
                    int(cid.strip())
                    for cid in channel_ids_str.split(",")
                    if cid.strip()
                )
            except ValueError:
                await context.log("Invalid channel ID format", "warning")

        if not self.bot_token:
            await context.log("Discord bot token not configured", "error")
            return

        # Set up intents
        intents = Intents.default()
        intents.message_content = True
        intents.guild_messages = True
        intents.dm_messages = True

        # Create client
        self.client = discord.Client(intents=intents)

        # Set up event handlers
        @self.client.event
        async def on_ready():
            await context.log(f"Discord bot connected as {self.client.user}")
            self._running = True

        @self.client.event
        async def on_message(message: discord.Message):
            await self._handle_message(message)

        # Start bot in background
        self._bot_task = asyncio.create_task(self._run_bot())
        await context.log("Starting Discord bot...")

    async def _run_bot(self):
        """Run the Discord bot."""
        try:
            await self.client.start(self.bot_token)
        except discord.LoginFailure:
            if self._context:
                await self._context.log("Invalid Discord bot token", "error")
        except Exception as e:
            if self._context:
                await self._context.log(f"Discord error: {str(e)}", "error")

    async def _handle_message(self, message: discord.Message):
        """Process a Discord message."""
        if not self._context:
            return

        # Ignore own messages
        if message.author == self.client.user:
            return

        # Filter bots
        if self.filter_bots and message.author.bot:
            return

        # Filter by channel
        if self.channel_ids and message.channel.id not in self.channel_ids:
            return

        # Check for mention
        is_mention = self.client.user in message.mentions

        # If mention_only is enabled, skip non-mentions
        if self.mention_only and not is_mention:
            return

        # Build message object
        msg = {
            "id": str(message.id),
            "text": message.content,
            "author": message.author.display_name,
            "authorId": str(message.author.id),
            "channelId": str(message.channel.id),
            "channelName": getattr(message.channel, 'name', 'DM'),
            "guildId": str(message.guild.id) if message.guild else None,
            "guildName": message.guild.name if message.guild else None,
            "timestamp": message.created_at.isoformat(),
            "isMention": is_mention,
            "isReply": message.reference is not None,
            "replyToId": str(message.reference.message_id) if message.reference else None,
        }

        self._last_message = msg

        # Emit appropriate event
        event_type = "message.mention" if is_mention else "message.received"
        await self._context.emit_event(Event(
            type=event_type,
            payload={
                "message": msg,
                "text": msg["text"],
                "author": msg["author"],
            }
        ))

        # Log the message
        channel_info = f"#{msg['channelName']}" if msg['guildName'] else "DM"
        await self._context.log(f"[{channel_info}] {msg['author']}: {msg['text'][:50]}...")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """
        Return the current connection status.

        In event-driven mode, this node emits events via the Discord client.
        The execute() method just returns status.
        """
        if not self._running:
            await context.log("Discord bot not connected", "warning")
            return {
                "connected": False,
                "message": None,
                "author": "",
                "text": ""
            }

        bot_name = self.client.user.name if self.client.user else "Unknown"
        await context.log(f"Discord bot active as {bot_name}")

        return {
            "connected": True,
            "botName": bot_name,
            "message": self._last_message,
            "author": self._last_message.get("author", "") if self._last_message else "",
            "text": self._last_message.get("text", "") if self._last_message else ""
        }

    async def teardown(self) -> None:
        """Clean up resources."""
        self._running = False
        if self.client and not self.client.is_closed():
            await self.client.close()
        if self._bot_task:
            self._bot_task.cancel()
            try:
                await self._bot_task
            except asyncio.CancelledError:
                pass
