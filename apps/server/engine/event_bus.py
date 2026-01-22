"""
Event Bus for AITuberFlow

Manages event routing between nodes with support for event filtering.
"""

from typing import Dict, List, Callable, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
import asyncio
import logging
import re

logger = logging.getLogger(__name__)


@dataclass
class Event:
    """Represents an event in the system."""
    type: str
    payload: Dict[str, Any]
    source_node_id: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class EventFilter:
    """Defines a filter for events."""
    event: str  # Event type pattern (supports wildcards like "message.*")
    condition: Optional[str] = None  # JavaScript-like condition expression

    def matches(self, event: Event) -> bool:
        """Check if an event matches this filter."""
        # Check event type pattern
        if not self._match_pattern(event.type):
            return False

        # Check condition if specified
        if self.condition:
            return self._evaluate_condition(event)

        return True

    def _match_pattern(self, event_type: str) -> bool:
        """Match event type against pattern (supports wildcards)."""
        pattern = self.event
        # Convert wildcard pattern to regex
        if '*' in pattern:
            regex = pattern.replace('.', r'\.').replace('*', '.*')
            return bool(re.match(f'^{regex}$', event_type))
        return pattern == event_type

    def _evaluate_condition(self, event: Event) -> bool:
        """Evaluate a condition expression against event payload."""
        if not self.condition:
            return True

        try:
            # Create evaluation context
            context = {
                'event': event.payload,
                'type': event.type,
                'source': event.source_node_id,
            }

            # Simple expression evaluation (safe subset)
            # Supports: event.field, comparisons, and/or
            condition = self.condition

            # Replace event.field with actual values
            # Note: bool must be checked before int (bool is subclass of int)
            for key, value in event.payload.items():
                if isinstance(value, bool):
                    condition = condition.replace(f'event.{key}', str(value))
                elif isinstance(value, str):
                    condition = condition.replace(f'event.{key}', f'"{value}"')
                elif isinstance(value, (int, float)):
                    condition = condition.replace(f'event.{key}', str(value))

            # Evaluate simple expressions
            # Support: ==, !=, >, <, >=, <=, and, or, not
            condition = condition.replace('&&', ' and ').replace('||', ' or ')
            condition = condition.replace('===', '==').replace('!==', '!=')
            # Support JavaScript-style true/false
            condition = condition.replace('true', 'True').replace('false', 'False')

            # Safe eval with restricted builtins
            result = eval(condition, {"__builtins__": {}}, {"True": True, "False": False})
            return bool(result)

        except Exception as e:
            logger.warning(f"Failed to evaluate condition '{self.condition}': {e}")
            return False


@dataclass
class Subscription:
    """Represents a subscription to events."""
    callback: Callable
    filters: List[EventFilter] = field(default_factory=list)
    node_id: Optional[str] = None


class EventBus:
    """
    Event bus for managing workflow events.
    Supports event filtering and pattern matching.
    """

    def __init__(self):
        self._subscriptions: Dict[str, List[Subscription]] = {}
        self._event_queue: asyncio.Queue = None
        self._running = False
        self._event_history: List[Event] = []
        self._max_history = 100

    async def start(self):
        """Start the event bus."""
        self._event_queue = asyncio.Queue()
        self._running = True
        self._event_history = []
        logger.info("Event bus started")

    async def stop(self):
        """Stop the event bus."""
        self._running = False
        if self._event_queue:
            while not self._event_queue.empty():
                try:
                    self._event_queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
        logger.info("Event bus stopped")

    def subscribe(
        self,
        event_type: str,
        callback: Callable,
        filters: List[EventFilter] = None,
        node_id: str = None
    ) -> str:
        """
        Subscribe to an event type with optional filters.

        Args:
            event_type: Event type pattern (supports wildcards)
            callback: Async callback function
            filters: Optional list of additional filters
            node_id: Optional node ID for tracking

        Returns:
            Subscription ID
        """
        if event_type not in self._subscriptions:
            self._subscriptions[event_type] = []

        subscription = Subscription(
            callback=callback,
            filters=filters or [],
            node_id=node_id
        )
        self._subscriptions[event_type].append(subscription)

        sub_id = f"{event_type}:{len(self._subscriptions[event_type])-1}"
        logger.debug(f"Subscribed to event: {event_type} (node: {node_id})")
        return sub_id

    def unsubscribe(self, event_type: str, callback: Callable = None, node_id: str = None):
        """Unsubscribe from an event type."""
        if event_type not in self._subscriptions:
            return

        if callback:
            self._subscriptions[event_type] = [
                sub for sub in self._subscriptions[event_type]
                if sub.callback != callback
            ]
        elif node_id:
            self._subscriptions[event_type] = [
                sub for sub in self._subscriptions[event_type]
                if sub.node_id != node_id
            ]

    async def emit(self, event: Event) -> int:
        """
        Emit an event to all matching subscribers.

        Returns:
            Number of subscribers notified
        """
        if not self._running:
            logger.warning("Event bus is not running, event dropped")
            return 0

        logger.debug(f"Emitting event: {event.type}")

        # Store in history
        self._event_history.append(event)
        if len(self._event_history) > self._max_history:
            self._event_history = self._event_history[-self._max_history:]

        notified = 0

        # Find matching subscriptions
        for pattern, subscriptions in self._subscriptions.items():
            if not self._pattern_matches(pattern, event.type):
                continue

            for subscription in subscriptions:
                # Check filters
                if subscription.filters:
                    if not all(f.matches(event) for f in subscription.filters):
                        continue

                try:
                    if asyncio.iscoroutinefunction(subscription.callback):
                        await subscription.callback(event)
                    else:
                        subscription.callback(event)
                    notified += 1
                except Exception as e:
                    logger.error(f"Error in event handler for {event.type}: {e}")

        return notified

    def _pattern_matches(self, pattern: str, event_type: str) -> bool:
        """Check if a subscription pattern matches an event type."""
        if pattern == '*':
            return True
        if '*' in pattern:
            regex = pattern.replace('.', r'\.').replace('*', '.*')
            return bool(re.match(f'^{regex}$', event_type))
        return pattern == event_type

    def clear_subscriptions(self, node_id: str = None):
        """Clear subscriptions, optionally for a specific node."""
        if node_id:
            for event_type in self._subscriptions:
                self._subscriptions[event_type] = [
                    sub for sub in self._subscriptions[event_type]
                    if sub.node_id != node_id
                ]
        else:
            self._subscriptions.clear()

    def get_history(self, event_type: str = None, limit: int = 10) -> List[Event]:
        """Get recent event history."""
        if event_type:
            events = [e for e in self._event_history if e.type == event_type]
        else:
            events = self._event_history
        return events[-limit:]


# Global event bus instance
event_bus = EventBus()
