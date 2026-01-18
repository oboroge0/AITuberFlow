"""
Type definitions for AITuberFlow Plugin SDK.
"""

from typing import Dict, List, Optional, Any, Literal
from pydantic import BaseModel, Field
from datetime import datetime


class PortDefinition(BaseModel):
    """Defines an input or output port for a node."""
    id: str
    type: str
    description: Optional[str] = None


class ConfigField(BaseModel):
    """Defines a configuration field for a node."""
    type: Literal["string", "number", "boolean", "select", "textarea"]
    label: str
    description: Optional[str] = None
    required: bool = False
    default: Optional[Any] = None
    options: Optional[List[Dict[str, Any]]] = None  # For select type
    min: Optional[float] = None  # For number type
    max: Optional[float] = None  # For number type


class PluginAuthor(BaseModel):
    """Plugin author information."""
    name: str
    url: Optional[str] = None


class PluginNodeDefinition(BaseModel):
    """Defines the node's ports and events."""
    inputs: List[PortDefinition] = Field(default_factory=list)
    outputs: List[PortDefinition] = Field(default_factory=list)
    events: Optional[Dict[str, List[str]]] = None


class PluginManifest(BaseModel):
    """
    Plugin manifest schema.

    This defines the metadata and configuration for a plugin.
    """
    id: str
    name: str
    version: str
    description: str
    author: PluginAuthor
    license: str = "MIT"
    category: Literal["input", "process", "output", "control"]
    node: PluginNodeDefinition
    config: Dict[str, ConfigField] = Field(default_factory=dict)
    dependencies: Optional[Dict[str, List[str]]] = None


class Message(BaseModel):
    """Represents a chat message."""
    role: Literal["user", "assistant"]
    content: str
    author: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    metadata: Optional[Dict[str, Any]] = None


class Emotion(BaseModel):
    """Character emotion state."""
    current: str = "neutral"
    intensity: float = 0.5


class Memory(BaseModel):
    """Long-term memory entry."""
    id: str
    content: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class CharacterState(BaseModel):
    """
    Character state during execution.

    This represents the current state of the AI character,
    including personality, emotions, and memory.
    """
    name: str = "AI Assistant"
    personality: str = "Friendly and helpful"
    emotion: Emotion = Field(default_factory=Emotion)
    short_term_memory: List[Message] = Field(default_factory=list)
    long_term_memory: List[Memory] = Field(default_factory=list)
    current_topic: Optional[str] = None
    last_spoke_at: Optional[str] = None


class StreamMessage(BaseModel):
    """Stream chat message."""
    id: str
    content: str
    author: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    superchat_amount: Optional[float] = None
    superchat_currency: Optional[str] = None
    is_member: bool = False


class StreamContext(BaseModel):
    """
    Stream context during execution.

    This represents the current state of the live stream,
    including viewer stats and message queues.
    """
    platform: Optional[str] = None
    video_id: Optional[str] = None
    channel_id: Optional[str] = None
    viewer_count: int = 0
    like_count: int = 0
    message_queue: List[StreamMessage] = Field(default_factory=list)
    superchat_queue: List[StreamMessage] = Field(default_factory=list)
    stream_started_at: Optional[str] = None
    last_message_at: Optional[str] = None
    silence_duration: float = 0
