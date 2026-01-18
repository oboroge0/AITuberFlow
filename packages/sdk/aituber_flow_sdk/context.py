"""
Node context for AITuberFlow Plugin SDK.
"""

from typing import Dict, Any, Optional, Callable, Awaitable
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Event:
    """
    Represents an event in the AITuberFlow event system.

    Events are used for communication between nodes and the event bus.
    """
    type: str
    payload: Dict[str, Any]
    source_node_id: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class NodeContext:
    """
    Context passed to node execution.

    Provides access to workflow state, event emission, and logging.
    """
    workflow_id: str
    node_id: str
    character: Dict[str, Any]

    # Internal callbacks (set by executor)
    _emit_callback: Optional[Callable[[Event], Awaitable[None]]] = None
    _log_callback: Optional[Callable[[str, str], Awaitable[None]]] = None
    _update_character_callback: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None

    async def emit_event(self, event: Event) -> None:
        """
        Emit an event to the event bus.

        Args:
            event: The event to emit
        """
        if self._emit_callback:
            event.source_node_id = self.node_id
            await self._emit_callback(event)

    async def log(self, message: str, level: str = "info") -> None:
        """
        Send a log message to the frontend.

        Args:
            message: The log message
            level: Log level ("info", "warning", "error", "debug")
        """
        if self._log_callback:
            await self._log_callback(message, level)

    async def update_character(self, updates: Dict[str, Any]) -> None:
        """
        Update the character state.

        Args:
            updates: Dictionary of updates to apply to character state
        """
        if self._update_character_callback:
            await self._update_character_callback(updates)

        # Also update local copy
        self.character.update(updates)

    def get_character_name(self) -> str:
        """Get the character's name."""
        return self.character.get("name", "AI Assistant")

    def get_character_personality(self) -> str:
        """Get the character's personality."""
        return self.character.get("personality", "")

    def get_emotion(self) -> Dict[str, Any]:
        """Get the character's current emotion."""
        return self.character.get("emotion", {"current": "neutral", "intensity": 0.5})
