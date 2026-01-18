"""
Base node class for AITuberFlow Plugin SDK.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

from .context import NodeContext, Event


class BaseNode(ABC):
    """
    Base class for all AITuberFlow nodes.

    Implement this class to create a custom node plugin.

    Example:
        ```python
        from aituber_flow_sdk import BaseNode, NodeContext

        class MyNode(BaseNode):
            async def setup(self, config: dict, context: NodeContext) -> None:
                self.my_setting = config.get("mySetting", "default")

            async def execute(self, inputs: dict, context: NodeContext) -> dict:
                input_text = inputs.get("text", "")
                result = f"Processed: {input_text}"
                await context.log(f"Processed input: {input_text}")
                return {"output": result}
        ```
    """

    async def setup(self, config: Dict[str, Any], context: NodeContext) -> None:
        """
        Initialize the node with configuration.

        Called once when the workflow starts. Use this to set up
        resources, connections, or cached data.

        Args:
            config: Node configuration from the workflow
            context: Execution context
        """
        pass

    @abstractmethod
    async def execute(self, inputs: Dict[str, Any], context: NodeContext) -> Dict[str, Any]:
        """
        Execute the node's main logic.

        Called for each execution cycle. Process inputs and return outputs.

        Args:
            inputs: Input values from connected upstream nodes
            context: Execution context

        Returns:
            Dictionary of output values for downstream nodes
        """
        pass

    async def teardown(self) -> None:
        """
        Clean up resources when the workflow stops.

        Called once when the workflow stops. Use this to close
        connections, release resources, etc.
        """
        pass

    async def on_event(self, event: Event, context: NodeContext) -> Optional[Dict[str, Any]]:
        """
        Handle an incoming event.

        Override this method for event-driven nodes that need to
        react to specific events.

        Args:
            event: The incoming event
            context: Execution context

        Returns:
            Optional output dictionary, or None if no output
        """
        return None


class InputNode(BaseNode):
    """
    Base class for input nodes.

    Input nodes generate data from external sources or user input.
    They typically have no inputs and one or more outputs.
    """

    async def execute(self, inputs: Dict[str, Any], context: NodeContext) -> Dict[str, Any]:
        """Default implementation returns empty outputs."""
        return {}


class ProcessNode(BaseNode):
    """
    Base class for processing nodes.

    Process nodes transform data from inputs to outputs.
    """

    @abstractmethod
    async def process(self, inputs: Dict[str, Any], context: NodeContext) -> Dict[str, Any]:
        """
        Process the inputs and return outputs.

        Args:
            inputs: Input values
            context: Execution context

        Returns:
            Processed output values
        """
        pass

    async def execute(self, inputs: Dict[str, Any], context: NodeContext) -> Dict[str, Any]:
        """Execute calls process method."""
        return await self.process(inputs, context)


class OutputNode(BaseNode):
    """
    Base class for output nodes.

    Output nodes send data to external destinations.
    They typically have one or more inputs and no outputs.
    """

    @abstractmethod
    async def output(self, inputs: Dict[str, Any], context: NodeContext) -> None:
        """
        Send the inputs to the output destination.

        Args:
            inputs: Input values to output
            context: Execution context
        """
        pass

    async def execute(self, inputs: Dict[str, Any], context: NodeContext) -> Dict[str, Any]:
        """Execute calls output method and returns empty dict."""
        await self.output(inputs, context)
        return {}
