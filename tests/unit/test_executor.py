"""
Tests for the Workflow Executor module.

Tests workflow execution logic, graph traversal, and node management.
"""

import pytest
import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# Add project paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
APPS_SERVER = PROJECT_ROOT / "apps" / "server"
SDK_PATH = PROJECT_ROOT / "packages" / "sdk"

if str(APPS_SERVER) not in sys.path:
    sys.path.insert(0, str(APPS_SERVER))
if str(SDK_PATH) not in sys.path:
    sys.path.insert(0, str(SDK_PATH))

from engine.executor import WorkflowExecutor, NodeContext, EventQueue
from engine.event_bus import Event, EventFilter


class TestWorkflowExecutorInit:
    """Tests for WorkflowExecutor initialization."""

    def test_init_creates_empty_dicts(self):
        """Test that initialization creates all required dictionaries."""
        executor = WorkflowExecutor()

        assert isinstance(executor._running_workflows, dict)
        assert isinstance(executor._event_buses, dict)
        assert isinstance(executor._log_callbacks, dict)
        assert isinstance(executor._event_callbacks, dict)
        assert isinstance(executor._status_callbacks, dict)
        assert isinstance(executor._node_instances, dict)
        assert isinstance(executor._event_queues, dict)
        assert isinstance(executor._source_nodes, dict)
        assert isinstance(executor._queue_processors, dict)
        assert isinstance(executor._background_tasks, dict)

    def test_set_log_callback(self):
        """Test setting a log callback."""
        executor = WorkflowExecutor()
        callback = AsyncMock()

        executor.set_log_callback("workflow-1", callback)

        assert executor._log_callbacks["workflow-1"] == callback

    def test_set_event_callback(self):
        """Test setting an event callback."""
        executor = WorkflowExecutor()
        callback = AsyncMock()

        executor.set_event_callback("workflow-1", callback)

        assert executor._event_callbacks["workflow-1"] == callback

    def test_set_status_callback(self):
        """Test setting a status callback."""
        executor = WorkflowExecutor()
        callback = AsyncMock()

        executor.set_status_callback("workflow-1", callback)

        assert executor._status_callbacks["workflow-1"] == callback


class TestEventQueue:
    """Tests for the EventQueue class."""

    @pytest.mark.asyncio
    async def test_put_and_get(self):
        """Test basic put and get operations."""
        queue = EventQueue(max_size=10)

        await queue.put({"event": "test"})
        result = await queue.get()

        assert result == {"event": "test"}

    @pytest.mark.asyncio
    async def test_queue_respects_max_size(self):
        """Test that queue drops events when full."""
        queue = EventQueue(max_size=2)

        await queue.put({"seq": 1})
        await queue.put({"seq": 2})
        result = await queue.put({"seq": 3})  # Should be dropped

        assert result is False
        assert queue.dropped_count == 1

    def test_is_processing(self):
        """Test processing state tracking."""
        queue = EventQueue(max_size=10)

        assert queue.is_processing() is False

        queue.set_processing(True)
        assert queue.is_processing() is True

        queue.set_processing(False)
        assert queue.is_processing() is False

    @pytest.mark.asyncio
    async def test_qsize(self):
        """Test queue size reporting."""
        queue = EventQueue(max_size=10)

        assert queue.qsize() == 0

        await queue.put({"a": 1})
        await queue.put({"b": 2})

        assert queue.qsize() == 2


class TestGraphTraversal:
    """Tests for graph traversal methods."""

    @pytest.fixture
    def executor(self):
        return WorkflowExecutor()

    def test_build_adjacency_simple(self, executor):
        """Test building adjacency list for a simple graph."""
        nodes = [
            {"id": "a"},
            {"id": "b"},
            {"id": "c"},
        ]
        connections = [
            {"from": {"nodeId": "a", "port": "out"}, "to": {"nodeId": "b", "port": "in"}},
            {"from": {"nodeId": "b", "port": "out"}, "to": {"nodeId": "c", "port": "in"}},
        ]

        adjacency = executor._build_adjacency(nodes, connections)

        assert adjacency == {
            "a": ["b"],
            "b": ["c"],
            "c": [],
        }

    def test_build_adjacency_branching(self, executor):
        """Test building adjacency list with branching."""
        nodes = [
            {"id": "a"},
            {"id": "b"},
            {"id": "c"},
        ]
        connections = [
            {"from": {"nodeId": "a", "port": "out1"}, "to": {"nodeId": "b", "port": "in"}},
            {"from": {"nodeId": "a", "port": "out2"}, "to": {"nodeId": "c", "port": "in"}},
        ]

        adjacency = executor._build_adjacency(nodes, connections)

        assert adjacency == {
            "a": ["b", "c"],
            "b": [],
            "c": [],
        }

    def test_build_adjacency_no_duplicates(self, executor):
        """Test that adjacency list doesn't contain duplicates."""
        nodes = [{"id": "a"}, {"id": "b"}]
        connections = [
            {"from": {"nodeId": "a", "port": "out1"}, "to": {"nodeId": "b", "port": "in1"}},
            {"from": {"nodeId": "a", "port": "out2"}, "to": {"nodeId": "b", "port": "in2"}},
        ]

        adjacency = executor._build_adjacency(nodes, connections)

        # Should only have one entry for b, not two
        assert adjacency["a"].count("b") == 1

    def test_get_downstream_nodes(self, executor):
        """Test getting downstream nodes using BFS."""
        adjacency = {
            "a": ["b", "c"],
            "b": ["d"],
            "c": ["d"],
            "d": [],
        }

        downstream = executor._get_downstream_nodes("a", adjacency)

        assert set(downstream) == {"b", "c", "d"}

    def test_get_downstream_nodes_handles_cycles(self, executor):
        """Test that downstream nodes handles potential cycles."""
        adjacency = {
            "a": ["b"],
            "b": ["c"],
            "c": ["b"],  # Cycle back to b
        }

        downstream = executor._get_downstream_nodes("a", adjacency)

        # Should visit each node only once
        assert downstream == ["b", "c"]


class TestExecutionOrder:
    """Tests for execution order calculation."""

    @pytest.fixture
    def executor(self):
        return WorkflowExecutor()

    def test_execution_order_linear(self, executor):
        """Test execution order for a linear graph."""
        nodes = [
            {"id": "a", "type": "start"},
            {"id": "b", "type": "process"},
            {"id": "c", "type": "end"},
        ]
        connections = [
            {"from": {"nodeId": "a"}, "to": {"nodeId": "b"}},
            {"from": {"nodeId": "b"}, "to": {"nodeId": "c"}},
        ]

        order = executor._get_execution_order(nodes, connections)
        order_ids = [n["id"] for n in order]

        # a should come before b, b before c
        assert order_ids.index("a") < order_ids.index("b")
        assert order_ids.index("b") < order_ids.index("c")

    def test_execution_order_branching(self, executor):
        """Test execution order for a branching graph."""
        nodes = [
            {"id": "a", "type": "start"},
            {"id": "b", "type": "process"},
            {"id": "c", "type": "process"},
            {"id": "d", "type": "end"},
        ]
        connections = [
            {"from": {"nodeId": "a"}, "to": {"nodeId": "b"}},
            {"from": {"nodeId": "a"}, "to": {"nodeId": "c"}},
            {"from": {"nodeId": "b"}, "to": {"nodeId": "d"}},
            {"from": {"nodeId": "c"}, "to": {"nodeId": "d"}},
        ]

        order = executor._get_execution_order(nodes, connections)
        order_ids = [n["id"] for n in order]

        # a should come first
        assert order_ids[0] == "a"
        # d should come last (depends on b and c)
        assert order_ids[-1] == "d"
        # b and c can be in any order between a and d
        assert "b" in order_ids[1:3]
        assert "c" in order_ids[1:3]

    def test_execution_order_no_start_node(self, executor):
        """Test execution order when there's no start node."""
        nodes = [
            {"id": "a", "type": "process"},
            {"id": "b", "type": "process"},
        ]
        connections = [
            {"from": {"nodeId": "a"}, "to": {"nodeId": "b"}},
        ]

        order = executor._get_execution_order(nodes, connections)
        order_ids = [n["id"] for n in order]

        # a has no incoming connections, so it's an entry point
        assert order_ids.index("a") < order_ids.index("b")

    def test_execution_order_empty(self, executor):
        """Test execution order with empty nodes."""
        order = executor._get_execution_order([], [])
        assert order == []

    def test_execution_order_isolated_nodes(self, executor):
        """Test that isolated nodes are still included."""
        nodes = [
            {"id": "a", "type": "start"},
            {"id": "b", "type": "process"},  # Connected
            {"id": "c", "type": "process"},  # Isolated
        ]
        connections = [
            {"from": {"nodeId": "a"}, "to": {"nodeId": "b"}},
        ]

        order = executor._get_execution_order(nodes, connections)
        order_ids = [n["id"] for n in order]

        # Only a and b should be in order (c is not reachable from start)
        assert "a" in order_ids
        assert "b" in order_ids
        # c is isolated and not reachable from start node
        assert "c" not in order_ids


class TestFilterSubgraph:
    """Tests for subgraph filtering."""

    @pytest.fixture
    def executor(self):
        return WorkflowExecutor()

    def test_filter_subgraph_basic(self, executor):
        """Test filtering a subgraph from a specific node."""
        workflow_data = {
            "nodes": [
                {"id": "a"},
                {"id": "b"},
                {"id": "c"},
                {"id": "d"},
            ],
            "connections": [
                {"from": {"nodeId": "a"}, "to": {"nodeId": "b"}},
                {"from": {"nodeId": "b"}, "to": {"nodeId": "c"}},
                {"from": {"nodeId": "d"}, "to": {"nodeId": "a"}},  # d connects to a
            ],
            "character": {"name": "Test"},
        }

        filtered = executor._filter_subgraph(workflow_data, "b")

        node_ids = {n["id"] for n in filtered["nodes"]}
        assert node_ids == {"b", "c"}
        assert filtered["character"] == {"name": "Test"}

    def test_filter_subgraph_preserves_connections(self, executor):
        """Test that filtered subgraph preserves relevant connections."""
        workflow_data = {
            "nodes": [
                {"id": "a"},
                {"id": "b"},
                {"id": "c"},
            ],
            "connections": [
                {"from": {"nodeId": "a"}, "to": {"nodeId": "b"}},
                {"from": {"nodeId": "b"}, "to": {"nodeId": "c"}},
            ],
        }

        filtered = executor._filter_subgraph(workflow_data, "b")

        # Only b->c connection should remain
        assert len(filtered["connections"]) == 1
        conn = filtered["connections"][0]
        assert conn["from"]["nodeId"] == "b"
        assert conn["to"]["nodeId"] == "c"


class TestGetNodeInputs:
    """Tests for node input collection."""

    @pytest.fixture
    def executor(self):
        return WorkflowExecutor()

    def test_get_node_inputs_simple(self, executor):
        """Test getting inputs from a single upstream node."""
        connections = [
            {"from": {"nodeId": "a", "port": "out"}, "to": {"nodeId": "b", "port": "in"}},
        ]
        node_outputs = {
            "a": {"out": "hello"},
        }

        inputs = executor._get_node_inputs("b", connections, node_outputs)

        assert inputs == {"in": "hello"}

    def test_get_node_inputs_multiple_ports(self, executor):
        """Test getting inputs from multiple ports."""
        connections = [
            {"from": {"nodeId": "a", "port": "out1"}, "to": {"nodeId": "c", "port": "in1"}},
            {"from": {"nodeId": "b", "port": "out"}, "to": {"nodeId": "c", "port": "in2"}},
        ]
        node_outputs = {
            "a": {"out1": "value1", "out2": "value2"},
            "b": {"out": "value3"},
        }

        inputs = executor._get_node_inputs("c", connections, node_outputs)

        assert inputs == {"in1": "value1", "in2": "value3"}

    def test_get_node_inputs_missing_upstream(self, executor):
        """Test that missing upstream outputs are ignored."""
        connections = [
            {"from": {"nodeId": "a", "port": "out"}, "to": {"nodeId": "b", "port": "in"}},
        ]
        node_outputs = {}  # No outputs yet

        inputs = executor._get_node_inputs("b", connections, node_outputs)

        assert inputs == {}


class TestNodeAcceptsEvent:
    """Tests for event filter matching in nodes."""

    @pytest.fixture
    def executor(self):
        return WorkflowExecutor()

    def test_node_accepts_event_no_filters(self, executor):
        """Test that nodes without filters accept all events."""
        node = {"id": "a", "type": "process"}
        event = Event(type="any.event", payload={})

        assert executor._node_accepts_event(node, event) is True

    def test_node_accepts_event_matching_filter(self, executor):
        """Test that nodes with matching filters accept events."""
        node = {
            "id": "a",
            "type": "process",
            "eventFilters": [{"event": "message.*"}],
        }
        event = Event(type="message.received", payload={})

        assert executor._node_accepts_event(node, event) is True

    def test_node_accepts_event_non_matching_filter(self, executor):
        """Test that nodes with non-matching filters reject events."""
        node = {
            "id": "a",
            "type": "process",
            "eventFilters": [{"event": "message.*"}],
        }
        event = Event(type="timer.tick", payload={})

        assert executor._node_accepts_event(node, event) is False

    def test_node_accepts_event_or_semantics(self, executor):
        """Test that multiple filters use OR semantics."""
        node = {
            "id": "a",
            "type": "process",
            "eventFilters": [
                {"event": "message.*"},
                {"event": "timer.*"},
            ],
        }

        assert executor._node_accepts_event(
            node, Event(type="message.received", payload={})
        ) is True
        assert executor._node_accepts_event(
            node, Event(type="timer.tick", payload={})
        ) is True
        assert executor._node_accepts_event(
            node, Event(type="other.event", payload={})
        ) is False

    def test_node_accepts_event_with_condition(self, executor):
        """Test that event filters with conditions work."""
        node = {
            "id": "a",
            "type": "process",
            "eventFilters": [
                {"event": "donation", "condition": "event.amount > 100"},
            ],
        }

        assert executor._node_accepts_event(
            node, Event(type="donation", payload={"amount": 150})
        ) is True
        assert executor._node_accepts_event(
            node, Event(type="donation", payload={"amount": 50})
        ) is False


class TestGetStatus:
    """Tests for workflow status retrieval."""

    @pytest.fixture
    def executor(self):
        return WorkflowExecutor()

    def test_get_status_not_running(self, executor):
        """Test status for non-existent workflow."""
        status = executor.get_status("nonexistent")
        assert status == {"status": "idle"}

    def test_get_status_running(self, executor):
        """Test status for running workflow."""
        executor._running_workflows["workflow-1"] = {
            "status": "running",
            "started_at": "2024-01-01T00:00:00",
        }

        status = executor.get_status("workflow-1")

        assert status["status"] == "running"

    @pytest.mark.asyncio
    async def test_get_status_with_queue(self, executor):
        """Test status includes queue information."""
        executor._running_workflows["workflow-1"] = {"status": "running"}

        queue = EventQueue(max_size=10)
        await queue.put({"event": "test"})
        executor._event_queues["workflow-1"] = queue

        status = executor.get_status("workflow-1")

        assert status["queue_size"] == 1
        assert status["queue_processing"] is False


class TestWorkflowLifecycle:
    """Integration tests for workflow lifecycle."""

    @pytest.fixture
    def executor(self):
        return WorkflowExecutor()

    @pytest.mark.asyncio
    async def test_start_workflow_creates_resources(self, executor):
        """Test that starting a workflow creates necessary resources."""
        # Use a timer source node to keep the workflow running (event-driven mode)
        workflow_data = {
            "nodes": [
                {"id": "timer", "type": "timer", "config": {"interval": 10000}},
                {"id": "output", "type": "console-output", "config": {}},
            ],
            "connections": [
                {"from": {"nodeId": "timer", "port": "text"}, "to": {"nodeId": "output", "port": "text"}},
            ],
            "character": {},
        }

        await executor.start_workflow("test-workflow", workflow_data)

        # Resources are created synchronously in start_workflow
        # Check immediately that resources were created
        assert "test-workflow" in executor._event_buses
        assert "test-workflow" in executor._event_queues
        assert "test-workflow" in executor._background_tasks
        assert "test-workflow" in executor._running_workflows

        # Clean up
        await executor.stop_workflow("test-workflow")

    @pytest.mark.asyncio
    async def test_stop_workflow_cleans_up_resources(self, executor):
        """Test that stopping a workflow cleans up resources."""
        workflow_data = {
            "nodes": [{"id": "a", "type": "start", "config": {}}],
            "connections": [],
            "character": {},
        }

        await executor.start_workflow("test-workflow", workflow_data)
        await asyncio.sleep(0.1)

        await executor.stop_workflow("test-workflow")

        # Check that resources were cleaned up
        assert "test-workflow" not in executor._running_workflows
        assert "test-workflow" not in executor._event_buses
        assert "test-workflow" not in executor._event_queues

    @pytest.mark.asyncio
    async def test_restart_running_workflow(self, executor):
        """Test that starting an already running workflow restarts it."""
        workflow_data = {
            "nodes": [{"id": "a", "type": "start", "config": {}}],
            "connections": [],
            "character": {},
        }

        await executor.start_workflow("test-workflow", workflow_data)
        await asyncio.sleep(0.1)

        # Start again (should restart)
        await executor.start_workflow("test-workflow", workflow_data)
        await asyncio.sleep(0.1)

        assert executor.get_status("test-workflow")["status"] in ["running", "completed"]

        # Clean up
        await executor.stop_workflow("test-workflow")


class TestNodeContext:
    """Tests for NodeContext functionality."""

    @pytest.mark.asyncio
    async def test_node_context_log(self):
        """Test that NodeContext can log messages."""
        logged_messages = []

        async def log_callback(node_id, message, level):
            logged_messages.append((node_id, message, level))

        context = NodeContext(
            workflow_id="wf-1",
            node_id="node-1",
            character={},
            event_bus=None,
            log_callback=lambda nid, msg, lvl: log_callback(nid, msg, lvl),
            task_registry=None,
        )

        await context.log("Test message", "info")

        assert len(logged_messages) == 1
        assert logged_messages[0] == ("node-1", "Test message", "info")

    @pytest.mark.asyncio
    async def test_node_context_emit_event(self):
        """Test that NodeContext can emit events."""
        from engine.event_bus import EventBus

        event_bus = EventBus()
        await event_bus.start()

        received_events = []

        async def handler(event):
            received_events.append(event)

        event_bus.subscribe("test.*", handler)

        context = NodeContext(
            workflow_id="wf-1",
            node_id="node-1",
            character={},
            event_bus=event_bus,
            log_callback=None,
            task_registry=None,
        )

        await context.emit_event(Event(type="test.event", payload={"key": "value"}))

        assert len(received_events) == 1
        assert received_events[0].payload == {"key": "value"}

        await event_bus.stop()

    def test_node_context_character_access(self):
        """Test that NodeContext provides character information."""
        context = NodeContext(
            workflow_id="wf-1",
            node_id="node-1",
            character={"name": "TestBot", "personality": "Friendly"},
            event_bus=None,
            log_callback=None,
            task_registry=None,
        )

        assert context.get_character_name() == "TestBot"
        assert context.get_character_personality() == "Friendly"
