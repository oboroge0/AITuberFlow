from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from datetime import datetime
import asyncio
import logging
import importlib.util
import sys
from pathlib import Path

from engine.event_bus import EventBus, Event

logger = logging.getLogger(__name__)

# Base path for plugins (from apps/server/engine/executor.py -> project root)
# Go up 4 levels: engine -> server -> apps -> project_root
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
PLUGINS_DIR = PROJECT_ROOT / "plugins"

# Add SDK to Python path for plugin imports
SDK_PATH = PROJECT_ROOT / "packages" / "sdk"
if str(SDK_PATH) not in sys.path:
    sys.path.insert(0, str(SDK_PATH))


@dataclass
class NodeContext:
    """Context passed to node execution."""
    workflow_id: str
    node_id: str
    character: Dict[str, Any]
    event_bus: EventBus
    log_callback: Any

    async def emit_event(self, event: Event):
        """Emit an event from this node."""
        event.source_node_id = self.node_id
        await self.event_bus.emit(event)

    async def log(self, message: str, level: str = "info"):
        """Log a message."""
        if self.log_callback:
            await self.log_callback(self.node_id, message, level)

    def get_character_name(self) -> str:
        """Get the character name from config."""
        return self.character.get("name", "AI Assistant")

    def get_character_personality(self) -> str:
        """Get the character personality from config."""
        return self.character.get("personality", "")


class WorkflowExecutor:
    """
    Executes workflows by processing nodes in topological order.
    Supports linear flows for MVP Phase 1.
    """

    def __init__(self):
        self._running_workflows: Dict[str, Dict[str, Any]] = {}
        self._event_buses: Dict[str, EventBus] = {}
        self._log_callbacks: Dict[str, Any] = {}
        self._event_callbacks: Dict[str, Any] = {}

    def set_log_callback(self, workflow_id: str, callback):
        """Set the log callback for a workflow."""
        self._log_callbacks[workflow_id] = callback

    def set_event_callback(self, workflow_id: str, callback):
        """Set the event callback for a workflow (for audio events, etc.)."""
        self._event_callbacks[workflow_id] = callback

    def get_status(self, workflow_id: str) -> Dict[str, Any]:
        """Get the execution status of a workflow."""
        if workflow_id in self._running_workflows:
            return self._running_workflows[workflow_id]
        return {"status": "idle"}

    async def start_workflow(self, workflow_id: str, workflow_data: Dict[str, Any]):
        """Start executing a workflow."""
        if workflow_id in self._running_workflows:
            logger.warning(f"Workflow {workflow_id} is already running")
            return

        # Create event bus for this workflow
        event_bus = EventBus()
        await event_bus.start()
        self._event_buses[workflow_id] = event_bus

        # Subscribe to audio events and forward to callback
        event_callback = self._event_callbacks.get(workflow_id)
        if event_callback:
            async def forward_audio_event(event: Event):
                if event.type == "audio.generated":
                    await event_callback(event)
            event_bus.subscribe("audio.*", forward_audio_event)

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

        # Stop event bus
        if workflow_id in self._event_buses:
            await self._event_buses[workflow_id].stop()
            del self._event_buses[workflow_id]

        # Update status
        self._running_workflows[workflow_id]["status"] = "stopped"
        del self._running_workflows[workflow_id]

        logger.info(f"Stopped workflow: {workflow_id}")

    async def _execute_workflow(self, workflow_id: str, workflow_data: Dict[str, Any]):
        """Execute a workflow (linear flow for MVP)."""
        try:
            nodes = workflow_data.get("nodes", [])
            connections = workflow_data.get("connections", [])
            character = workflow_data.get("character", {})

            if not nodes:
                logger.warning(f"No nodes in workflow {workflow_id}")
                return

            # Build execution order (topological sort for linear flow)
            execution_order = self._get_execution_order(nodes, connections)

            # Check for Start node and log appropriately
            has_start_node = any(n.get("type") == "start" for n in nodes)
            total_nodes = len(nodes)
            executing_nodes = len(execution_order)
            skipped_nodes = total_nodes - executing_nodes

            if executing_nodes == 0:
                await self._log(workflow_id, None, "No executable nodes found. Add nodes and connect them.", "warning")
                return

            if has_start_node:
                if skipped_nodes > 0:
                    await self._log(workflow_id, None, f"Workflow started: {executing_nodes}/{total_nodes} nodes ({skipped_nodes} not connected to Start)", "info")
                else:
                    await self._log(workflow_id, None, f"Workflow started ({executing_nodes} nodes)", "info")
            else:
                await self._log(workflow_id, None, f"Workflow started ({executing_nodes} nodes) - Tip: Add a Start node for better control", "info")

            # Execute nodes in order
            node_outputs: Dict[str, Dict[str, Any]] = {}

            for node in execution_order:
                if workflow_id not in self._running_workflows:
                    break

                node_id = node["id"]
                node_type = node["type"]
                node_config = node.get("config", {})

                # Get inputs from connected nodes
                inputs = self._get_node_inputs(node_id, connections, node_outputs)

                # Create context
                context = NodeContext(
                    workflow_id=workflow_id,
                    node_id=node_id,
                    character=character,
                    event_bus=self._event_buses.get(workflow_id),
                    log_callback=lambda nid, msg, lvl: self._log(workflow_id, nid, msg, lvl),
                )

                # Execute node
                await self._log(workflow_id, node_id, f"Executing node: {node_type}", "info")

                try:
                    outputs = await self._execute_node(
                        node_type, node_config, inputs, context
                    )
                    node_outputs[node_id] = outputs or {}

                    await self._log(
                        workflow_id, node_id, f"Node completed: {node_type}", "info"
                    )
                except Exception as e:
                    await self._log(
                        workflow_id, node_id, f"Node error: {str(e)}", "error"
                    )
                    raise

            await self._log(workflow_id, None, "Workflow execution completed", "info")

        except Exception as e:
            logger.error(f"Workflow execution error: {e}")
            if workflow_id in self._running_workflows:
                self._running_workflows[workflow_id]["status"] = "error"
                self._running_workflows[workflow_id]["error"] = str(e)

        finally:
            # Cleanup
            if workflow_id in self._running_workflows:
                self._running_workflows[workflow_id]["status"] = "completed"

    def _get_execution_order(
        self, nodes: List[Dict], connections: List[Dict]
    ) -> List[Dict]:
        """
        Get nodes in execution order (topological sort).
        - If Start node(s) exist: only nodes reachable from Start nodes execute
        - If no Start node: all nodes with no incoming connections are entry points (backward compatible)
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
            # If Start nodes exist, only use Start nodes as entry points
            entry_points = start_nodes
            logger.info(f"Found {len(start_nodes)} Start node(s)")
        else:
            # No Start node - use all nodes with no incoming connections (backward compatible)
            entry_points = [nid for nid, deg in in_degree.items() if deg == 0]
            logger.info(f"No Start node found. Using {len(entry_points)} entry point(s) with no incoming connections")

        # If no entry points at all, return empty (shouldn't happen normally)
        if not entry_points:
            logger.warning("No entry points found in workflow")
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

        # If Start node exists but some entry_point nodes with no incoming connections exist,
        # only execute Start-connected nodes (this is the intended behavior)

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
                if from_port in upstream_outputs:
                    inputs[to_port] = upstream_outputs[from_port]

        return inputs

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
        logger.info(f"Looking for plugin at: {plugin_path} (exists: {plugin_path.exists()})")

        if plugin_path.exists():
            try:
                # Load plugin dynamically
                spec = importlib.util.spec_from_file_location(f"plugin_{node_type}", plugin_path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                # Find the node class
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
                    logger.info(f"Found plugin class: {node_class.__name__} for {node_type}")
                    node_instance = node_class()
                    if hasattr(node_instance, "setup"):
                        await node_instance.setup(config, context)
                    outputs = await node_instance.execute(inputs, context)
                    if hasattr(node_instance, "teardown"):
                        await node_instance.teardown()
                    return outputs
                else:
                    logger.warning(f"No valid node class found in plugin: {node_type}")
                    await context.log(f"No valid node class found in plugin: {node_type}", "warning")
            except Exception as e:
                import traceback
                logger.error(f"Failed to load plugin {node_type}: {e}\n{traceback.format_exc()}")
                await context.log(f"Plugin load error: {str(e)}", "error")
                # Continue to try builtin fallback

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
        # Control flow nodes
        if node_type == "start":
            await context.log("Workflow started from Start node")
            return {"trigger": True}

        elif node_type == "end":
            message = config.get("message", "Workflow completed")
            await context.log(f"Workflow ended: {message}")
            return {}

        elif node_type == "manual-input":
            # Return the configured input text
            text = config.get("inputText", "")
            await context.log(f"Input: {text}")
            return {"text": text}

        elif node_type == "console-output":
            # Log the input text
            text = inputs.get("text", "")
            prefix = config.get("prefix", "[Output]")
            await context.log(f"{prefix} {text}")
            return {}

        elif node_type == "openai-llm":
            # Call OpenAI API
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
