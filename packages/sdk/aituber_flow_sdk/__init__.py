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
from .errors import (
    ErrorCode,
    get_error_message,
    format_error_with_action,
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
    "ErrorCode",
    "get_error_message",
    "format_error_with_action",
]
