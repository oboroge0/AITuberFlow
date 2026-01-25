"""
Tests for the Event Bus module.

Tests event routing, filtering, pattern matching, and subscription management.
"""

import pytest
import sys
from pathlib import Path

# Add project paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
APPS_SERVER = PROJECT_ROOT / "apps" / "server"
SDK_PATH = PROJECT_ROOT / "packages" / "sdk"

if str(APPS_SERVER) not in sys.path:
    sys.path.insert(0, str(APPS_SERVER))
if str(SDK_PATH) not in sys.path:
    sys.path.insert(0, str(SDK_PATH))

from engine.event_bus import Event, EventFilter, EventBus, Subscription


class TestEvent:
    """Tests for the Event dataclass."""

    def test_event_creation_minimal(self):
        """Test creating an event with minimal fields."""
        event = Event(type="test.event", payload={"key": "value"})

        assert event.type == "test.event"
        assert event.payload == {"key": "value"}
        assert event.source_node_id is None
        assert event.timestamp is not None

    def test_event_creation_full(self):
        """Test creating an event with all fields."""
        event = Event(
            type="avatar.expression",
            payload={"expression": "happy", "intensity": 0.8},
            source_node_id="node-123",
        )

        assert event.type == "avatar.expression"
        assert event.payload["expression"] == "happy"
        assert event.source_node_id == "node-123"


class TestEventFilter:
    """Tests for the EventFilter class."""

    def test_exact_match(self):
        """Test exact event type matching."""
        filter = EventFilter(event="message.received")
        event = Event(type="message.received", payload={})

        assert filter.matches(event) is True

    def test_exact_match_fails(self):
        """Test that non-matching event type fails."""
        filter = EventFilter(event="message.received")
        event = Event(type="message.sent", payload={})

        assert filter.matches(event) is False

    def test_wildcard_match_suffix(self):
        """Test wildcard matching with suffix pattern."""
        filter = EventFilter(event="message.*")

        assert filter.matches(Event(type="message.received", payload={})) is True
        assert filter.matches(Event(type="message.sent", payload={})) is True
        assert filter.matches(Event(type="avatar.expression", payload={})) is False

    def test_wildcard_match_prefix(self):
        """Test wildcard matching with prefix pattern."""
        filter = EventFilter(event="*.received")

        assert filter.matches(Event(type="message.received", payload={})) is True
        assert filter.matches(Event(type="chat.received", payload={})) is True
        assert filter.matches(Event(type="message.sent", payload={})) is False

    def test_condition_string_equality(self):
        """Test condition with string equality."""
        filter = EventFilter(
            event="chat.message",
            condition='event.author == "admin"'
        )

        assert filter.matches(Event(type="chat.message", payload={"author": "admin"})) is True
        assert filter.matches(Event(type="chat.message", payload={"author": "user"})) is False

    def test_condition_numeric_comparison(self):
        """Test condition with numeric comparison."""
        filter = EventFilter(
            event="donation",
            condition="event.amount >= 100"
        )

        assert filter.matches(Event(type="donation", payload={"amount": 150})) is True
        assert filter.matches(Event(type="donation", payload={"amount": 50})) is False

    def test_condition_boolean(self):
        """Test condition with boolean values."""
        filter = EventFilter(
            event="chat.message",
            condition="event.is_member == true"
        )

        assert filter.matches(Event(type="chat.message", payload={"is_member": True})) is True
        assert filter.matches(Event(type="chat.message", payload={"is_member": False})) is False

    def test_condition_javascript_operators(self):
        """Test that JavaScript-style operators are converted."""
        filter = EventFilter(
            event="test",
            condition="event.a === 1 && event.b === 2"
        )

        assert filter.matches(Event(type="test", payload={"a": 1, "b": 2})) is True
        assert filter.matches(Event(type="test", payload={"a": 1, "b": 3})) is False

    def test_condition_invalid_returns_false(self):
        """Test that invalid conditions return False."""
        filter = EventFilter(
            event="test",
            condition="invalid_syntax((("
        )

        # Should not raise, just return False
        assert filter.matches(Event(type="test", payload={})) is False


class TestEventBus:
    """Tests for the EventBus class."""

    @pytest.fixture
    def event_bus(self):
        """Create a fresh EventBus for each test."""
        return EventBus()

    @pytest.mark.asyncio
    async def test_start_and_stop(self, event_bus):
        """Test starting and stopping the event bus."""
        await event_bus.start()
        assert event_bus._running is True
        assert event_bus._event_queue is not None

        await event_bus.stop()
        assert event_bus._running is False

    @pytest.mark.asyncio
    async def test_subscribe_and_emit(self, event_bus):
        """Test subscribing and emitting events."""
        await event_bus.start()

        received_events = []

        async def handler(event):
            received_events.append(event)

        event_bus.subscribe("test.event", handler)

        event = Event(type="test.event", payload={"data": "hello"})
        notified = await event_bus.emit(event)

        assert notified == 1
        assert len(received_events) == 1
        assert received_events[0].payload["data"] == "hello"

        await event_bus.stop()

    @pytest.mark.asyncio
    async def test_emit_when_not_running(self, event_bus):
        """Test that emitting when not running drops events."""
        # Don't start the bus
        event = Event(type="test.event", payload={})
        notified = await event_bus.emit(event)

        assert notified == 0

    @pytest.mark.asyncio
    async def test_wildcard_subscription(self, event_bus):
        """Test wildcard event subscription."""
        await event_bus.start()

        received = []

        async def handler(event):
            received.append(event.type)

        event_bus.subscribe("avatar.*", handler)

        await event_bus.emit(Event(type="avatar.expression", payload={}))
        await event_bus.emit(Event(type="avatar.motion", payload={}))
        await event_bus.emit(Event(type="audio.play", payload={}))

        assert len(received) == 2
        assert "avatar.expression" in received
        assert "avatar.motion" in received
        assert "audio.play" not in received

        await event_bus.stop()

    @pytest.mark.asyncio
    async def test_unsubscribe_by_callback(self, event_bus):
        """Test unsubscribing by callback."""
        await event_bus.start()

        received = []

        async def handler(event):
            received.append(event)

        event_bus.subscribe("test", handler)
        await event_bus.emit(Event(type="test", payload={}))
        assert len(received) == 1

        event_bus.unsubscribe("test", callback=handler)
        await event_bus.emit(Event(type="test", payload={}))
        assert len(received) == 1  # Still 1, no new events

        await event_bus.stop()

    @pytest.mark.asyncio
    async def test_unsubscribe_by_node_id(self, event_bus):
        """Test unsubscribing by node ID."""
        await event_bus.start()

        received = []

        async def handler(event):
            received.append(event)

        event_bus.subscribe("test", handler, node_id="node-1")
        await event_bus.emit(Event(type="test", payload={}))
        assert len(received) == 1

        event_bus.unsubscribe("test", node_id="node-1")
        await event_bus.emit(Event(type="test", payload={}))
        assert len(received) == 1

        await event_bus.stop()

    @pytest.mark.asyncio
    async def test_clear_subscriptions_all(self, event_bus):
        """Test clearing all subscriptions."""
        await event_bus.start()

        async def handler(event):
            pass

        event_bus.subscribe("test.a", handler)
        event_bus.subscribe("test.b", handler)

        event_bus.clear_subscriptions()

        assert len(event_bus._subscriptions.get("test.a", [])) == 0
        assert len(event_bus._subscriptions.get("test.b", [])) == 0

        await event_bus.stop()

    @pytest.mark.asyncio
    async def test_clear_subscriptions_by_node(self, event_bus):
        """Test clearing subscriptions for a specific node."""
        await event_bus.start()

        async def handler1(event):
            pass

        async def handler2(event):
            pass

        event_bus.subscribe("test", handler1, node_id="node-1")
        event_bus.subscribe("test", handler2, node_id="node-2")

        event_bus.clear_subscriptions(node_id="node-1")

        subscriptions = event_bus._subscriptions.get("test", [])
        assert len(subscriptions) == 1
        assert subscriptions[0].node_id == "node-2"

        await event_bus.stop()

    @pytest.mark.asyncio
    async def test_event_history(self, event_bus):
        """Test event history tracking."""
        await event_bus.start()

        await event_bus.emit(Event(type="test.a", payload={"seq": 1}))
        await event_bus.emit(Event(type="test.b", payload={"seq": 2}))
        await event_bus.emit(Event(type="test.a", payload={"seq": 3}))

        # Get all history
        history = event_bus.get_history(limit=10)
        assert len(history) == 3

        # Get filtered history
        history_a = event_bus.get_history(event_type="test.a", limit=10)
        assert len(history_a) == 2
        assert all(e.type == "test.a" for e in history_a)

        await event_bus.stop()

    @pytest.mark.asyncio
    async def test_event_history_limit(self, event_bus):
        """Test that event history respects max limit."""
        await event_bus.start()
        event_bus._max_history = 5

        for i in range(10):
            await event_bus.emit(Event(type="test", payload={"seq": i}))

        history = event_bus.get_history(limit=10)
        assert len(history) == 5
        # Should have the last 5 events (seq 5-9)
        assert history[0].payload["seq"] == 5
        assert history[-1].payload["seq"] == 9

        await event_bus.stop()

    @pytest.mark.asyncio
    async def test_subscription_with_filters(self, event_bus):
        """Test subscription with additional filters."""
        await event_bus.start()

        received = []

        async def handler(event):
            received.append(event)

        filters = [EventFilter(event="*", condition="event.priority > 5")]
        event_bus.subscribe("task.created", handler, filters=filters)

        await event_bus.emit(Event(type="task.created", payload={"priority": 3}))
        await event_bus.emit(Event(type="task.created", payload={"priority": 8}))

        assert len(received) == 1
        assert received[0].payload["priority"] == 8

        await event_bus.stop()

    @pytest.mark.asyncio
    async def test_sync_callback(self, event_bus):
        """Test that sync callbacks also work."""
        await event_bus.start()

        received = []

        def sync_handler(event):
            received.append(event)

        event_bus.subscribe("test", sync_handler)
        await event_bus.emit(Event(type="test", payload={}))

        assert len(received) == 1

        await event_bus.stop()

    @pytest.mark.asyncio
    async def test_handler_exception_doesnt_break_others(self, event_bus):
        """Test that an exception in one handler doesn't affect others."""
        await event_bus.start()

        received = []

        async def failing_handler(event):
            raise ValueError("Test error")

        async def working_handler(event):
            received.append(event)

        event_bus.subscribe("test", failing_handler)
        event_bus.subscribe("test", working_handler)

        # Should not raise
        await event_bus.emit(Event(type="test", payload={}))

        assert len(received) == 1

        await event_bus.stop()

    @pytest.mark.asyncio
    async def test_multiple_subscribers_same_event(self, event_bus):
        """Test multiple subscribers to the same event."""
        await event_bus.start()

        received_1 = []
        received_2 = []

        async def handler1(event):
            received_1.append(event)

        async def handler2(event):
            received_2.append(event)

        event_bus.subscribe("test", handler1)
        event_bus.subscribe("test", handler2)

        notified = await event_bus.emit(Event(type="test", payload={}))

        assert notified == 2
        assert len(received_1) == 1
        assert len(received_2) == 1

        await event_bus.stop()


class TestPatternMatching:
    """Tests specifically for pattern matching logic."""

    @pytest.fixture
    def event_bus(self):
        return EventBus()

    def test_exact_match(self, event_bus):
        assert event_bus._pattern_matches("test.event", "test.event") is True
        assert event_bus._pattern_matches("test.event", "test.other") is False

    def test_star_matches_all(self, event_bus):
        assert event_bus._pattern_matches("*", "anything") is True
        assert event_bus._pattern_matches("*", "a.b.c") is True

    def test_suffix_wildcard(self, event_bus):
        assert event_bus._pattern_matches("test.*", "test.event") is True
        assert event_bus._pattern_matches("test.*", "test.another") is True
        assert event_bus._pattern_matches("test.*", "other.event") is False

    def test_prefix_wildcard(self, event_bus):
        assert event_bus._pattern_matches("*.event", "test.event") is True
        assert event_bus._pattern_matches("*.event", "other.event") is True
        assert event_bus._pattern_matches("*.event", "test.another") is False

    def test_middle_wildcard(self, event_bus):
        assert event_bus._pattern_matches("a.*.c", "a.b.c") is True
        assert event_bus._pattern_matches("a.*.c", "a.x.c") is True
        assert event_bus._pattern_matches("a.*.c", "a.b.d") is False
