"""
Node context for AITuberFlow Plugin SDK.
"""

import asyncio
from typing import Dict, Any, Optional, Callable, Awaitable, Union, Set
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
    _background_tasks: Set[asyncio.Task] = field(default_factory=set)

    async def emit_event(self, event: Union["Event", Dict[str, Any]]) -> None:
        """
        Emit an event to the event bus.

        Args:
            event: The event to emit (Event object or dict with 'type' key)
        """
        if self._emit_callback:
            # Convert dict to Event if needed
            if isinstance(event, dict):
                event = Event(
                    type=event.get("type", "unknown"),
                    payload={k: v for k, v in event.items() if k not in ("type", "source_node_id", "timestamp")}
                )
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

    def create_task(self, coro) -> asyncio.Task:
        """
        Create a background task that is tracked by the context.

        The task will be automatically cancelled when the workflow stops.
        Use this for long-running operations like realtime lip-sync emission.

        Args:
            coro: A coroutine to run as a background task

        Returns:
            The created asyncio.Task
        """
        task = asyncio.create_task(coro)
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)
        return task

    async def cancel_background_tasks(self) -> None:
        """Cancel all background tasks created by this context."""
        for task in self._background_tasks:
            if not task.done():
                task.cancel()
        if self._background_tasks:
            await asyncio.gather(*self._background_tasks, return_exceptions=True)
        self._background_tasks.clear()
