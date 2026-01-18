"""
AITuberFlow Plugin SDK

Provides base classes and utilities for building AITuberFlow plugins.
"""

from .base import BaseNode
from .context import NodeContext, Event
from .types import (
    PortDefinition,
    ConfigField,
    PluginManifest,
    Message,
    CharacterState,
    StreamContext,
)

__version__ = "0.1.0"
__all__ = [
    "BaseNode",
    "NodeContext",
    "Event",
    "PortDefinition",
    "ConfigField",
    "PluginManifest",
    "Message",
    "CharacterState",
    "StreamContext",
]
