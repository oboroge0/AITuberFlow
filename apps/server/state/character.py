from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class Message:
    """Represents a chat message."""
    role: str  # "user" or "assistant"
    content: str
    author: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class Memory:
    """Represents a long-term memory."""
    id: str
    content: str
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class Emotion:
    """Represents the current emotional state."""
    current: str = "neutral"
    intensity: float = 0.5


@dataclass
class CharacterState:
    """
    Manages the state of an AI character during workflow execution.
    """
    name: str = "AI Assistant"
    personality: str = "Friendly and helpful virtual streamer"
    emotion: Emotion = field(default_factory=Emotion)
    short_term_memory: List[Message] = field(default_factory=list)
    long_term_memory: List[Memory] = field(default_factory=list)
    current_topic: Optional[str] = None
    last_spoke_at: Optional[str] = None

    # Configuration
    max_short_term_memory: int = 20

    def add_message(self, message: Message):
        """Add a message to short-term memory."""
        self.short_term_memory.append(message)
        # Keep only recent messages
        if len(self.short_term_memory) > self.max_short_term_memory:
            self.short_term_memory = self.short_term_memory[-self.max_short_term_memory:]

    def update_emotion(self, emotion: str, intensity: float = 0.5):
        """Update the character's emotion."""
        self.emotion = Emotion(current=emotion, intensity=max(0, min(1, intensity)))

    def get_conversation_history(self) -> List[Dict[str, str]]:
        """Get conversation history for LLM context."""
        return [
            {"role": msg.role, "content": msg.content}
            for msg in self.short_term_memory
        ]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "personality": self.personality,
            "emotion": {
                "current": self.emotion.current,
                "intensity": self.emotion.intensity,
            },
            "memory": {
                "shortTerm": [
                    {
                        "role": m.role,
                        "content": m.content,
                        "author": m.author,
                        "timestamp": m.timestamp,
                    }
                    for m in self.short_term_memory
                ],
                "longTerm": [
                    {"id": m.id, "content": m.content, "timestamp": m.timestamp}
                    for m in self.long_term_memory
                ],
            },
            "currentTopic": self.current_topic,
            "lastSpokeAt": self.last_spoke_at,
        }

    @classmethod
    def from_config(cls, config: Dict[str, Any]) -> "CharacterState":
        """Create from configuration dictionary."""
        return cls(
            name=config.get("name", "AI Assistant"),
            personality=config.get("personality", "Friendly and helpful"),
        )
