from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class StreamMessage:
    """Represents a stream chat message."""
    id: str
    content: str
    author: str
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    superchat_amount: Optional[float] = None
    superchat_currency: Optional[str] = None
    is_member: bool = False


@dataclass
class StreamContext:
    """
    Manages the context of a live stream during workflow execution.
    """
    platform: Optional[str] = None  # "youtube", "twitch", "discord"
    video_id: Optional[str] = None
    channel_id: Optional[str] = None

    # Live stats
    viewer_count: int = 0
    like_count: int = 0

    # Queues
    message_queue: List[StreamMessage] = field(default_factory=list)
    superchat_queue: List[StreamMessage] = field(default_factory=list)

    # Timing
    stream_started_at: Optional[str] = None
    last_message_at: Optional[str] = None

    # Configuration
    max_queue_size: int = 100

    @property
    def silence_duration(self) -> float:
        """Get seconds since last message."""
        if not self.last_message_at:
            return 0
        last = datetime.fromisoformat(self.last_message_at)
        return (datetime.utcnow() - last).total_seconds()

    def add_message(self, message: StreamMessage):
        """Add a message to the queue."""
        self.message_queue.append(message)
        self.last_message_at = message.timestamp

        # Handle superchat
        if message.superchat_amount:
            self.superchat_queue.append(message)

        # Trim queues
        if len(self.message_queue) > self.max_queue_size:
            self.message_queue = self.message_queue[-self.max_queue_size:]
        if len(self.superchat_queue) > self.max_queue_size:
            self.superchat_queue = self.superchat_queue[-self.max_queue_size:]

    def pop_message(self) -> Optional[StreamMessage]:
        """Get and remove the next message from the queue."""
        if self.message_queue:
            return self.message_queue.pop(0)
        return None

    def pop_superchat(self) -> Optional[StreamMessage]:
        """Get and remove the next superchat from the queue."""
        if self.superchat_queue:
            return self.superchat_queue.pop(0)
        return None

    def update_stats(self, viewer_count: int = None, like_count: int = None):
        """Update stream statistics."""
        if viewer_count is not None:
            self.viewer_count = viewer_count
        if like_count is not None:
            self.like_count = like_count

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "platform": self.platform,
            "videoId": self.video_id,
            "channelId": self.channel_id,
            "viewerCount": self.viewer_count,
            "likeCount": self.like_count,
            "messageQueue": [
                {
                    "id": m.id,
                    "content": m.content,
                    "author": m.author,
                    "timestamp": m.timestamp,
                }
                for m in self.message_queue[-10:]  # Only recent messages
            ],
            "superchatQueue": [
                {
                    "id": m.id,
                    "content": m.content,
                    "author": m.author,
                    "amount": m.superchat_amount,
                    "currency": m.superchat_currency,
                }
                for m in self.superchat_queue[-10:]
            ],
            "streamStartedAt": self.stream_started_at,
            "lastMessageAt": self.last_message_at,
            "silenceDuration": self.silence_duration,
        }
