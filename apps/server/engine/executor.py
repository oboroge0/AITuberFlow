from typing import Dict, Any, Optional, List, Set
from dataclasses import dataclass
from datetime import datetime
import asyncio
import logging
import importlib.util
import sys
from pathlib import Path

from engine.event_bus import EventBus, Event, EventFilter

logger = logging.getLogger(__name__)

# Base path for plugins (from apps/server/engine/executor.py -> project root)
# Go up 4 levels: engine -> server -> apps -> project_root
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
PLUGINS_DIR = PROJECT_ROOT / "plugins"

# Add SDK to Python path for plugin imports
SDK_PATH = PROJECT_ROOT / "packages" / "sdk"
if str(SDK_PATH) not in sys.path:
    sys.path.insert(0, str(SDK_PATH))

# Source node types that emit events and run continuously
SOURCE_NODE_TYPES: Set[str] = {'twitch-chat', 'youtube-chat', 'timer'}


@dataclass
class NodeContext:
    """Context passed to node execution."""
    workflow_id: str
    node_id: str
    character: Dict[str, Any]
    event_bus: EventBus
    log_callback: Any
    task_registry: Optional[Set[asyncio.Task]] = None

    async def emit_event(self, event):
        """Emit an event from this node.

        Args:
            event: Event object or dict with 'type' key
        """
        # Convert dict to Event if needed
        if isinstance(event, dict):
            event = Event(
                type=event.get("type", "unknown"),
                payload={k: v for k, v in event.items() if k not in ("type", "source_node_id", "timestamp")}
            )
        event.source_node_id = self.node_id
        await self.event_bus.emit(event)

    async def log(self, message: str, level: str = "info"):
        """Log a message."""
        if self.log_callback:
            await self.log_callback(self.node_id, message, level)

    def create_task(self, coro) -> asyncio.Task:
        """Create and track a background task tied to the workflow."""
        task = asyncio.create_task(coro)
        if self.task_registry is not None:
            self.task_registry.add(task)
            task.add_done_callback(lambda t: self.task_registry.discard(t))
        return task

    async def update_character(self, updates: Dict[str, Any]) -> None:
        """Update the shared character state."""
        if isinstance(updates, dict):
            self.character.update(updates)

    def get_character_name(self) -> str:
        """Get the character name from config."""
        return self.character.get("name", "AI Assistant")

    def get_character_personality(self) -> str:
        """Get the character personality from config."""
        return self.character.get("personality", "")


@dataclass
class NodeRuntime:
    """Holds runtime state for a node instance."""
    node_id: str
    node_type: str
    config: Dict[str, Any]
    instance: Optional[Any]
    context: NodeContext


class EventQueue:
    """Simple async event queue for sequential processing."""

    def __init__(self, max_size: int = 100):
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=max_size)
        self._processing = False
        self._dropped_count = 0

    async def put(self, event: Any) -> bool:
        """Add event to queue. Returns False if queue is full."""
        try:
            self._queue.put_nowait(event)
            return True
        except asyncio.QueueFull:
            self._dropped_count += 1
            return False

    async def get(self) -> Any:
        """Get next event from queue (blocking)."""
        return await self._queue.get()

    def is_processing(self) -> bool:
        return self._processing

    def set_processing(self, value: bool):
        self._processing = value

    def qsize(self) -> int:
        return self._queue.qsize()

    @property
    def dropped_count(self) -> int:
        return self._dropped_count


class WorkflowExecutor:
    """
    Executes workflows with event-driven support for source nodes.

    Source nodes (twitch-chat, youtube-chat, timer) run continuously
    and emit events that trigger downstream node execution.
    """

    def __init__(self):
        self._running_workflows: Dict[str, Dict[str, Any]] = {}
        self._event_buses: Dict[str, EventBus] = {}
        self._log_callbacks: Dict[str, Any] = {}
        self._event_callbacks: Dict[str, Any] = {}
        self._status_callbacks: Dict[str, Any] = {}
        # Node instances per workflow (for stateful nodes)
        self._node_instances: Dict[str, Dict[str, NodeRuntime]] = {}
        # Event queues for each workflow
        self._event_queues: Dict[str, EventQueue] = {}
        # Source node instances (kept alive)
        self._source_nodes: Dict[str, Dict[str, Any]] = {}  # workflow_id -> {node_id: instance}
        # Queue processor tasks
        self._queue_processors: Dict[str, asyncio.Task] = {}
        # Background tasks tied to workflow lifetime (e.g., lip sync emitters)
        self._background_tasks: Dict[str, Set[asyncio.Task]] = {}

    def set_log_callback(self, workflow_id: str, callback):
        """Set the log callback for a workflow."""
        self._log_callbacks[workflow_id] = callback

    def set_event_callback(self, workflow_id: str, callback):
        """Set the event callback for a workflow (for audio events, etc.)."""
        self._event_callbacks[workflow_id] = callback

    def set_status_callback(self, workflow_id: str, callback):
        """Set the status callback for node execution status updates."""
        self._status_callbacks[workflow_id] = callback

    def _create_node_context(self, workflow_id: str, node_id: str, character: Dict[str, Any]) -> NodeContext:
        """Create a NodeContext for a node."""
        return NodeContext(
            workflow_id=workflow_id,
            node_id=node_id,
            character=character,
            event_bus=self._event_buses.get(workflow_id),
            log_callback=lambda nid, msg, lvl, wid=workflow_id: self._log(wid, nid, msg, lvl),
            task_registry=self._background_tasks.get(workflow_id),
        )

    async def _initialize_nodes(
        self,
        workflow_id: str,
        nodes: List[Dict[str, Any]],
        character: Dict[str, Any],
    ) -> None:
        """Load and set up node instances for a workflow."""
        self._node_instances[workflow_id] = {}

        for node in nodes:
            node_id = node["id"]
            node_type = node["type"]
            node_config = node.get("config", {})

            context = self._create_node_context(workflow_id, node_id, character)
            instance = await self._load_node_instance(node_type)

            self._node_instances[workflow_id][node_id] = NodeRuntime(
                node_id=node_id,
                node_type=node_type,
                config=node_config,
                instance=instance,
                context=context,
            )

            if instance and hasattr(instance, "setup"):
                try:
                    await instance.setup(node_config, context)
                except Exception as e:
                    await self._log(workflow_id, node_id, f"Node setup error: {e}", "error")

    def _get_node_runtime(self, workflow_id: str, node_id: str) -> Optional[NodeRuntime]:
        """Get runtime state for a node."""
        return self._node_instances.get(workflow_id, {}).get(node_id)

    async def _execute_node_runtime(self, runtime: NodeRuntime, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a node using its cached instance."""
        if runtime.instance:
            return await runtime.instance.execute(inputs, runtime.context)
        return await self._execute_builtin_node(runtime.node_type, runtime.config, inputs, runtime.context)

    async def _teardown_nodes(self, workflow_id: str) -> None:
        """Tear down all node instances for a workflow."""
        runtimes = self._node_instances.pop(workflow_id, {})
        for runtime in runtimes.values():
            instance = runtime.instance
            if instance and hasattr(instance, "teardown"):
                try:
                    await instance.teardown()
                except Exception as e:
                    logger.error(f"Error tearing down node {runtime.node_id}: {e}")

    def _node_accepts_event(self, node: Dict[str, Any], event: Event) -> bool:
        """Check if a node's eventFilters allow the event (OR semantics)."""
        filters = node.get("eventFilters") or node.get("event_filters")
        if not filters:
            return True

        for filter_def in filters:
            event_name = filter_def.get("event")
            if not event_name:
                continue
            event_filter = EventFilter(event=event_name, condition=filter_def.get("condition"))
            if event_filter.matches(event):
                return True

        return False

    async def _cleanup_completed_workflow(self, workflow_id: str) -> None:
        """Clean up resources after a linear workflow completes."""
        await self._await_background_tasks(workflow_id)

        if workflow_id in self._queue_processors:
            self._queue_processors[workflow_id].cancel()
            try:
                await self._queue_processors[workflow_id]
            except asyncio.CancelledError:
                pass
            del self._queue_processors[workflow_id]

        await self._cancel_background_tasks(workflow_id)

        await self._teardown_nodes(workflow_id)

        if workflow_id in self._source_nodes:
            del self._source_nodes[workflow_id]

        if workflow_id in self._event_buses:
            await self._event_buses[workflow_id].stop()
            del self._event_buses[workflow_id]

        if workflow_id in self._event_queues:
            del self._event_queues[workflow_id]

        if workflow_id in self._background_tasks:
            del self._background_tasks[workflow_id]

    async def _await_background_tasks(self, workflow_id: str) -> None:
        """Wait for background tasks (lip sync, realtime emitters) to finish."""
        tasks = list(self._background_tasks.get(workflow_id, set()))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _cancel_background_tasks(self, workflow_id: str) -> None:
        """Cancel background tasks tied to a workflow."""
        tasks = list(self._background_tasks.get(workflow_id, set()))
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._background_tasks.pop(workflow_id, None)

    def get_status(self, workflow_id: str) -> Dict[str, Any]:
        """Get the execution status of a workflow."""
        if workflow_id in self._running_workflows:
            status = self._running_workflows[workflow_id].copy()
            # Add queue info
            if workflow_id in self._event_queues:
                queue = self._event_queues[workflow_id]
                status["queue_size"] = queue.qsize()
                status["queue_processing"] = queue.is_processing()
                status["queue_dropped"] = queue.dropped_count
            return status
        return {"status": "idle"}

    async def start_workflow(
        self,
        workflow_id: str,
        workflow_data: Dict[str, Any],
        start_node_id: Optional[str] = None
    ):
        """Start executing a workflow.

        Args:
            workflow_id: The workflow ID
            workflow_data: The workflow data (nodes, connections, character)
            start_node_id: Optional node ID to start from (executes only subgraph)
        """
        if workflow_id in self._running_workflows:
            logger.info(f"Workflow {workflow_id} is already running, restarting...")
            await self.stop_workflow(workflow_id)

        # Create event bus for this workflow
        event_bus = EventBus()
        await event_bus.start()
        self._event_buses[workflow_id] = event_bus
        self._background_tasks[workflow_id] = set()

        # Create event queue
        self._event_queues[workflow_id] = EventQueue(max_size=100)

        # Subscribe to events and forward to callback
        event_callback = self._event_callbacks.get(workflow_id)
        if event_callback:
            async def forward_event(event: Event):
                # Forward audio, avatar, and subtitle events
                if event.type.startswith("audio.") or \
                   event.type.startswith("avatar.") or \
                   event.type == "subtitle":
                    await event_callback(event)

            event_bus.subscribe("audio.*", forward_event)
            event_bus.subscribe("avatar.*", forward_event)
            event_bus.subscribe("subtitle", forward_event)

        # Filter to subgraph if start_node_id specified
        if start_node_id:
            workflow_data = self._filter_subgraph(workflow_data, start_node_id)
            logger.info(f"Filtered workflow to subgraph starting from node: {start_node_id}")

        # Track running state
        self._running_workflows[workflow_id] = {
            "status": "running",
            "started_at": datetime.utcnow(),
            "workflow_data": workflow_data,
        }

        # Start execution in background
        asyncio.create_task(self._execute_workflow(workflow_id, workflow_data))

        logger.info(f"Started workflow: {workflow_id}")

    async def stop_workflow(self, workflow_id: str):
        """Stop a running workflow."""
        if workflow_id not in self._running_workflows:
            return

        # Stop queue processor
        if workflow_id in self._queue_processors:
            self._queue_processors[workflow_id].cancel()
            try:
                await self._queue_processors[workflow_id]
            except asyncio.CancelledError:
                pass
            del self._queue_processors[workflow_id]

        # Teardown all nodes
        await self._teardown_nodes(workflow_id)

        # Clear source node tracking
        if workflow_id in self._source_nodes:
            del self._source_nodes[workflow_id]

        # Stop event bus
        if workflow_id in self._event_buses:
            await self._event_buses[workflow_id].stop()
            del self._event_buses[workflow_id]

        # Clean up event queue
        if workflow_id in self._event_queues:
            del self._event_queues[workflow_id]

        # Clean up background tasks registry
        if workflow_id in self._background_tasks:
            del self._background_tasks[workflow_id]

        # Update status
        self._running_workflows[workflow_id]["status"] = "stopped"
        del self._running_workflows[workflow_id]

        logger.info(f"Stopped workflow: {workflow_id}")

    async def _execute_workflow(self, workflow_id: str, workflow_data: Dict[str, Any]):
        """Execute a workflow with event-driven support."""
        try:
            nodes = workflow_data.get("nodes", [])
            connections = workflow_data.get("connections", [])
            character = workflow_data.get("character", {})

            if not nodes:
                logger.warning(f"No nodes in workflow {workflow_id}")
                return

            await self._initialize_nodes(workflow_id, nodes, character)

            # Separate source nodes from regular nodes
            source_nodes = [n for n in nodes if n.get("type") in SOURCE_NODE_TYPES]
            regular_nodes = [n for n in nodes if n.get("type") not in SOURCE_NODE_TYPES]

            # Build adjacency for downstream execution
            adjacency = self._build_adjacency(nodes, connections)

            # Check for Start node
            has_start_node = any(n.get("type") == "start" for n in nodes)
            has_source_nodes = len(source_nodes) > 0

            if has_source_nodes:
                await self._log(workflow_id, None,
                    f"Event-driven workflow: {len(source_nodes)} source node(s), {len(regular_nodes)} regular node(s)", "info")
            elif has_start_node:
                await self._log(workflow_id, None, f"Linear workflow ({len(nodes)} nodes)", "info")
            else:
                await self._log(workflow_id, None, f"Workflow started ({len(nodes)} nodes)", "info")

            # If there are source nodes, run in event-driven mode
            if has_source_nodes:
                await self._run_event_driven(
                    workflow_id, nodes, connections, character, source_nodes, adjacency
                )
            else:
                # Traditional linear execution
                await self._run_linear(workflow_id, nodes, connections, character)

        except Exception as e:
            logger.error(f"Workflow execution error: {e}")
            import traceback
            traceback.print_exc()
            if workflow_id in self._running_workflows:
                self._running_workflows[workflow_id]["status"] = "error"
                self._running_workflows[workflow_id]["error"] = str(e)

    async def _run_event_driven(
        self,
        workflow_id: str,
        nodes: List[Dict],
        connections: List[Dict],
        character: Dict[str, Any],
        source_nodes: List[Dict],
        adjacency: Dict[str, List[str]]
    ):
        """Run workflow in event-driven mode."""
        self._source_nodes[workflow_id] = {}

        # Start source nodes
        for node in source_nodes:
            node_id = node["id"]
            node_type = node["type"]

            runtime = self._get_node_runtime(workflow_id, node_id)
            if not runtime or not runtime.instance:
                await self._log(workflow_id, node_id, f"Failed to load source node: {node_type}", "error")
                await self._update_node_status(workflow_id, node_id, "error", {"error": "Plugin not found"})
                continue

            self._source_nodes[workflow_id][node_id] = {
                "instance": runtime.instance,
                "node": node,
                "context": runtime.context,
            }
            await self._update_node_status(workflow_id, node_id, "listening")
            await self._log(workflow_id, node_id, f"Source node started: {node_type}", "info")

        # Subscribe to source events
        event_bus = self._event_buses.get(workflow_id)
        if event_bus:
            async def on_source_event(event: Event):
                # Queue the event for processing
                queue = self._event_queues.get(workflow_id)
                if queue:
                    added = await queue.put({
                        "event": event,
                        "source_node_id": event.source_node_id,
                    })
                    if not added:
                        await self._log(workflow_id, None, "Event queue full, dropping event", "warning")

            # Subscribe to message events from source nodes
            event_bus.subscribe("message.*", on_source_event)
            event_bus.subscribe("timer.*", on_source_event)

        # Start queue processor
        self._queue_processors[workflow_id] = asyncio.create_task(
            self._process_event_queue(workflow_id, nodes, connections, character, adjacency)
        )

        await self._log(workflow_id, None, "Listening for events...", "info")

    async def _process_event_queue(
        self,
        workflow_id: str,
        nodes: List[Dict],
        connections: List[Dict],
        character: Dict[str, Any],
        adjacency: Dict[str, List[str]]
    ):
        """Process events from the queue sequentially."""
        queue = self._event_queues.get(workflow_id)

        while workflow_id in self._running_workflows:
            try:
                # Wait for next event
                event_data = await asyncio.wait_for(queue.get(), timeout=1.0)
                queue.set_processing(True)

                event = event_data["event"]
                source_node_id = event_data["source_node_id"]

                await self._log(workflow_id, source_node_id,
                    f"Processing event: {event.type}", "info")

                # Get downstream nodes from source
                downstream_ids = self._get_downstream_nodes(source_node_id, adjacency)

                if not downstream_ids:
                    await self._log(workflow_id, source_node_id,
                        "No downstream nodes connected", "warning")
                    queue.set_processing(False)
                    continue

                # Execute downstream nodes with event payload as input
                node_outputs: Dict[str, Dict[str, Any]] = {}

                # Set source node output from event payload
                node_outputs[source_node_id] = event.payload

                # Precompute inbound connection counts
                inbound_counts: Dict[str, int] = {}
                for conn in connections:
                    to_id = conn.get("to", {}).get("nodeId")
                    if to_id:
                        inbound_counts[to_id] = inbound_counts.get(to_id, 0) + 1

                # Execute downstream nodes in order
                execution_order = self._get_execution_order_from(
                    source_node_id, nodes, connections, adjacency
                )

                for node in execution_order:
                    if workflow_id not in self._running_workflows:
                        break

                    node_id = node["id"]
                    node_type = node["type"]

                    # Skip source nodes in downstream execution
                    if node_type in SOURCE_NODE_TYPES:
                        continue

                    # Respect event filters (OR semantics)
                    if not self._node_accepts_event(node, event):
                        continue

                    # Get inputs
                    inputs = self._get_node_inputs(node_id, connections, node_outputs)
                    if not inputs and inbound_counts.get(node_id, 0) > 0:
                        continue

                    runtime = self._get_node_runtime(workflow_id, node_id)
                    if not runtime:
                        await self._log(workflow_id, node_id, f"Node runtime missing: {node_type}", "warning")
                        continue

                    await self._update_node_status(workflow_id, node_id, "running")

                    try:
                        outputs = await self._execute_node_runtime(runtime, inputs)
                        node_outputs[node_id] = outputs or {}
                        await self._update_node_status(workflow_id, node_id, "completed",
                            {"outputs": outputs})
                    except Exception as e:
                        await self._update_node_status(workflow_id, node_id, "error",
                            {"error": str(e)})
                        await self._log(workflow_id, node_id, f"Node error: {e}", "error")

                queue.set_processing(False)

            except asyncio.TimeoutError:
                # No event in queue, continue waiting
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Queue processor error: {e}")
                import traceback
                traceback.print_exc()
                if queue:
                    queue.set_processing(False)

    async def _run_linear(
        self,
        workflow_id: str,
        nodes: List[Dict],
        connections: List[Dict],
        character: Dict[str, Any]
    ):
        """Traditional linear execution (no source nodes)."""
        # Build execution order (topological sort for linear flow)
        execution_order = self._get_execution_order(nodes, connections)

        if not execution_order:
            await self._log(workflow_id, None, "No executable nodes found", "warning")
            return

        # Execute nodes in order
        node_outputs: Dict[str, Dict[str, Any]] = {}

        for node in execution_order:
            if workflow_id not in self._running_workflows:
                break

            node_id = node["id"]
            node_type = node["type"]

            # Get inputs from connected nodes
            inputs = self._get_node_inputs(node_id, connections, node_outputs)
            runtime = self._get_node_runtime(workflow_id, node_id)
            if not runtime:
                await self._log(workflow_id, node_id, f"Node runtime missing: {node_type}", "warning")
                continue

            # Execute node
            await self._log(workflow_id, node_id, f"Executing node: {node_type}", "info")
            await self._update_node_status(workflow_id, node_id, "running")

            try:
                outputs = await self._execute_node_runtime(runtime, inputs)
                node_outputs[node_id] = outputs or {}

                await self._update_node_status(workflow_id, node_id, "completed",
                    {"outputs": outputs})
                await self._log(
                    workflow_id, node_id, f"Node completed: {node_type}", "info"
                )
            except Exception as e:
                await self._update_node_status(workflow_id, node_id, "error", {"error": str(e)})
                await self._log(
                    workflow_id, node_id, f"Node error: {str(e)}", "error"
                )
                raise

        await self._log(workflow_id, None, "Workflow execution completed", "info")

        # Mark as completed for linear workflows
        if workflow_id in self._running_workflows:
            self._running_workflows[workflow_id]["status"] = "completed"

        await self._cleanup_completed_workflow(workflow_id)

    def _filter_subgraph(
        self, workflow_data: Dict[str, Any], start_node_id: str
    ) -> Dict[str, Any]:
        """Filter workflow data to only include nodes reachable from start_node_id.

        Args:
            workflow_data: The full workflow data
            start_node_id: The node ID to start from

        Returns:
            Filtered workflow data with only the subgraph
        """
        nodes = workflow_data.get("nodes", [])
        connections = workflow_data.get("connections", [])

        # Build adjacency list
        adjacency = {}
        for node in nodes:
            adjacency[node["id"]] = []
        for conn in connections:
            from_id = conn.get("from", {}).get("nodeId")
            to_id = conn.get("to", {}).get("nodeId")
            if from_id and to_id and from_id in adjacency:
                adjacency[from_id].append(to_id)

        # BFS to find all reachable nodes from start_node_id
        reachable = {start_node_id}
        queue = [start_node_id]
        while queue:
            current = queue.pop(0)
            for neighbor in adjacency.get(current, []):
                if neighbor not in reachable:
                    reachable.add(neighbor)
                    queue.append(neighbor)

        # Filter nodes and connections
        filtered_nodes = [n for n in nodes if n["id"] in reachable]
        filtered_connections = [
            c for c in connections
            if c.get("from", {}).get("nodeId") in reachable
            and c.get("to", {}).get("nodeId") in reachable
        ]

        return {
            **workflow_data,
            "nodes": filtered_nodes,
            "connections": filtered_connections,
        }

    def _build_adjacency(
        self, nodes: List[Dict], connections: List[Dict]
    ) -> Dict[str, List[str]]:
        """Build adjacency list from connections."""
        adjacency = {n["id"]: [] for n in nodes}
        for conn in connections:
            from_id = conn.get("from", {}).get("nodeId")
            to_id = conn.get("to", {}).get("nodeId")
            if from_id and to_id and from_id in adjacency:
                if to_id not in adjacency[from_id]:
                    adjacency[from_id].append(to_id)
        return adjacency

    def _get_downstream_nodes(
        self, source_id: str, adjacency: Dict[str, List[str]]
    ) -> List[str]:
        """Get all downstream node IDs from a source node using BFS."""
        visited = set()
        queue = list(adjacency.get(source_id, []))
        result = []

        while queue:
            node_id = queue.pop(0)
            if node_id in visited:
                continue
            visited.add(node_id)
            result.append(node_id)
            queue.extend(adjacency.get(node_id, []))

        return result

    def _get_execution_order_from(
        self,
        source_id: str,
        nodes: List[Dict],
        connections: List[Dict],
        adjacency: Dict[str, List[str]]
    ) -> List[Dict]:
        """Get execution order for downstream nodes from a source."""
        node_map = {n["id"]: n for n in nodes}
        downstream_ids = self._get_downstream_nodes(source_id, adjacency)

        if not downstream_ids:
            return []

        # Calculate in-degree for downstream nodes only
        in_degree = {nid: 0 for nid in downstream_ids}
        for conn in connections:
            from_id = conn.get("from", {}).get("nodeId")
            to_id = conn.get("to", {}).get("nodeId")
            if to_id in in_degree:
                # Count edges from source or other downstream nodes
                if from_id == source_id or from_id in downstream_ids:
                    in_degree[to_id] += 1

        # Nodes directly connected to source have in_degree adjusted
        for nid in adjacency.get(source_id, []):
            if nid in in_degree:
                in_degree[nid] = 0  # Ready to execute

        # Kahn's algorithm
        queue = [nid for nid, deg in in_degree.items() if deg == 0]
        order = []

        while queue:
            node_id = queue.pop(0)
            order.append(node_map[node_id])

            for neighbor in adjacency.get(node_id, []):
                if neighbor in in_degree:
                    in_degree[neighbor] -= 1
                    if in_degree[neighbor] == 0:
                        queue.append(neighbor)

        return order

    def _get_execution_order(
        self, nodes: List[Dict], connections: List[Dict]
    ) -> List[Dict]:
        """
        Get nodes in execution order (topological sort).
        - If Start node(s) exist: only nodes reachable from Start nodes execute
        - If no Start node: all nodes with no incoming connections are entry points
        """
        if not nodes:
            return []

        # Build adjacency list
        node_map = {n["id"]: n for n in nodes}
        in_degree = {n["id"]: 0 for n in nodes}
        adjacency = {n["id"]: [] for n in nodes}

        for conn in connections:
            from_id = conn.get("from", {}).get("nodeId")
            to_id = conn.get("to", {}).get("nodeId")
            if from_id and to_id and from_id in adjacency and to_id in in_degree:
                adjacency[from_id].append(to_id)
                in_degree[to_id] += 1

        # Find all Start nodes
        start_nodes = [n["id"] for n in nodes if n.get("type") == "start"]
        has_start_node = len(start_nodes) > 0

        # Determine entry points
        if has_start_node:
            entry_points = start_nodes
        else:
            entry_points = [nid for nid, deg in in_degree.items() if deg == 0]

        if not entry_points:
            return []

        # Find all nodes reachable from entry points using BFS
        reachable = set()
        queue = list(entry_points)
        while queue:
            node_id = queue.pop(0)
            if node_id in reachable:
                continue
            reachable.add(node_id)
            for neighbor in adjacency.get(node_id, []):
                if neighbor not in reachable:
                    queue.append(neighbor)

        # Recalculate in_degree for reachable nodes only
        filtered_in_degree = {nid: 0 for nid in reachable}
        for conn in connections:
            from_id = conn.get("from", {}).get("nodeId")
            to_id = conn.get("to", {}).get("nodeId")
            if from_id in reachable and to_id in reachable:
                filtered_in_degree[to_id] += 1

        # Kahn's algorithm on reachable nodes only
        exec_queue = [nid for nid, deg in filtered_in_degree.items() if deg == 0]
        order = []

        while exec_queue:
            node_id = exec_queue.pop(0)
            order.append(node_map[node_id])

            for neighbor in adjacency.get(node_id, []):
                if neighbor in filtered_in_degree:
                    filtered_in_degree[neighbor] -= 1
                    if filtered_in_degree[neighbor] == 0:
                        exec_queue.append(neighbor)

        return order

    def _get_node_inputs(
        self, node_id: str, connections: List[Dict], node_outputs: Dict[str, Dict]
    ) -> Dict[str, Any]:
        """Get inputs for a node from connected upstream nodes."""
        inputs = {}

        for conn in connections:
            to_node = conn.get("to", {}).get("nodeId")
            to_port = conn.get("to", {}).get("port")
            from_node = conn.get("from", {}).get("nodeId")
            from_port = conn.get("from", {}).get("port")

            if to_node == node_id and from_node in node_outputs:
                upstream_outputs = node_outputs[from_node]
                if isinstance(upstream_outputs, dict):
                    if from_port in upstream_outputs:
                        inputs[to_port] = upstream_outputs[from_port]
                    else:
                        # If no specific port, pass whole output
                        inputs[to_port] = upstream_outputs
                else:
                    inputs[to_port] = upstream_outputs

        return inputs

    async def _load_node_instance(self, node_type: str) -> Optional[Any]:
        """Load a node plugin instance."""
        plugin_path = PLUGINS_DIR / node_type / "node.py"

        if not plugin_path.exists():
            return None

        try:
            spec = importlib.util.spec_from_file_location(f"plugin_{node_type}", plugin_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            for name in dir(module):
                obj = getattr(module, name)
                if (
                    isinstance(obj, type)
                    and name != "BaseNode"
                    and hasattr(obj, "execute")
                ):
                    return obj()

        except Exception as e:
            logger.error(f"Failed to load plugin {node_type}: {e}")

        return None

    async def _execute_node(
        self,
        node_type: str,
        config: Dict[str, Any],
        inputs: Dict[str, Any],
        context: NodeContext,
    ) -> Dict[str, Any]:
        """Execute a single node."""
        # Try to load and execute the plugin
        plugin_path = PLUGINS_DIR / node_type / "node.py"

        if plugin_path.exists():
            try:
                spec = importlib.util.spec_from_file_location(f"plugin_{node_type}", plugin_path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                node_class = None
                for name in dir(module):
                    obj = getattr(module, name)
                    if (
                        isinstance(obj, type)
                        and name != "BaseNode"
                        and hasattr(obj, "execute")
                    ):
                        node_class = obj
                        break

                if node_class:
                    node_instance = node_class()
                    if hasattr(node_instance, "setup"):
                        await node_instance.setup(config, context)
                    outputs = await node_instance.execute(inputs, context)
                    if hasattr(node_instance, "teardown"):
                        await node_instance.teardown()
                    return outputs

            except Exception as e:
                import traceback
                logger.error(f"Failed to load plugin {node_type}: {e}\n{traceback.format_exc()}")
                await context.log(f"Plugin load error: {str(e)}", "error")

        # Fallback for built-in nodes
        return await self._execute_builtin_node(node_type, config, inputs, context)

    async def _execute_builtin_node(
        self,
        node_type: str,
        config: Dict[str, Any],
        inputs: Dict[str, Any],
        context: NodeContext,
    ) -> Dict[str, Any]:
        """Execute built-in node types."""
        if node_type == "start":
            await context.log("Workflow started from Start node")
            return {"trigger": True}

        elif node_type == "end":
            message = config.get("message", "Workflow completed")
            await context.log(f"Workflow ended: {message}")
            return {}

        elif node_type == "manual-input":
            text = config.get("inputText", "")
            await context.log(f"Input: {text}")
            return {"text": text}

        elif node_type == "console-output":
            text = inputs.get("text", "")
            prefix = config.get("prefix", "[Output]")
            await context.log(f"{prefix} {text}")
            return {}

        elif node_type == "openai-llm":
            return await self._execute_openai_node(config, inputs, context)

        else:
            await context.log(f"Unknown node type: {node_type}", "warning")
            return {}

    async def _execute_openai_node(
        self,
        config: Dict[str, Any],
        inputs: Dict[str, Any],
        context: NodeContext,
    ) -> Dict[str, Any]:
        """Execute OpenAI LLM node."""
        try:
            import openai

            api_key = config.get("apiKey")
            if not api_key:
                await context.log("OpenAI API key not configured", "error")
                return {"response": "Error: API key not configured"}

            client = openai.AsyncOpenAI(api_key=api_key)

            model = config.get("model", "gpt-4o-mini")
            system_prompt = config.get("systemPrompt", "You are a helpful assistant.")
            temperature = config.get("temperature", 0.7)
            prompt = inputs.get("prompt", "")

            if not prompt:
                await context.log("No prompt provided", "warning")
                return {"response": ""}

            await context.log(f"Calling OpenAI API ({model})...")

            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature,
            )

            result = response.choices[0].message.content
            await context.log(f"Response received ({len(result)} chars)")

            return {"response": result}

        except Exception as e:
            await context.log(f"OpenAI error: {str(e)}", "error")
            return {"response": f"Error: {str(e)}"}

    async def _log(
        self, workflow_id: str, node_id: Optional[str], message: str, level: str
    ):
        """Send log to the callback."""
        callback = self._log_callbacks.get(workflow_id)
        if callback:
            await callback(node_id, message, level)

    async def _update_node_status(
        self, workflow_id: str, node_id: str, status: str, data: Optional[Dict] = None
    ):
        """Send node status update to the callback."""
        callback = self._status_callbacks.get(workflow_id)
        if callback:
            await callback(node_id, status, data)
