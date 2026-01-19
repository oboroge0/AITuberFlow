"""
Data Formatter Node

Formats data as JSON, XML, or YAML for structured output.
Supports template-based formatting with variable substitution.
"""

import sys
import re
import json
from pathlib import Path
from typing import Any, Dict, Optional

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext


class DataFormatterNode(BaseNode):
    """
    Data Formatter Node

    Formats input data as JSON, XML, or YAML with template support.
    """

    def __init__(self):
        self.format = "json"
        self.template = ""
        self.root_element = "data"
        self.pretty_print = True

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.format = config.get("format", "json")
        self.template = config.get("template", "")
        self.root_element = config.get("rootElement", "data")
        self.pretty_print = config.get("prettyPrint", True)

        await context.log(f"Data Formatter configured: {self.format.upper()} output")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Format the input data."""
        data = inputs.get("data", {})

        # Handle various input types
        if isinstance(data, str):
            # Try to parse as JSON first
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                # Keep as string, wrap in object
                data = {"value": data}
        elif not isinstance(data, dict):
            data = {"value": data}

        try:
            # Apply template if provided
            if self.template:
                processed_data = self._apply_template(self.template, data)
            else:
                processed_data = data

            # Format output
            if self.format == "json":
                formatted = self._to_json(processed_data)
            elif self.format == "xml":
                formatted = self._to_xml(processed_data)
            elif self.format == "yaml":
                formatted = self._to_yaml(processed_data)
            else:
                formatted = str(processed_data)

            await context.log(f"Formatted data as {self.format.upper()} ({len(formatted)} chars)")

            return {
                "formatted": formatted,
                "parsed": processed_data if isinstance(processed_data, dict) else {"value": processed_data},
            }

        except Exception as e:
            await context.log(f"Formatting error: {str(e)}", "error")
            return {
                "formatted": f"Error: {str(e)}",
                "parsed": data,
            }

    def _apply_template(self, template: str, data: dict) -> Any:
        """
        Apply template with variable substitution.

        Supports:
        - {{field}} - Simple substitution
        - {{field.nested}} - Nested field access
        - {{field|default:value}} - Default values
        """
        result = template

        # Find all {{...}} patterns
        pattern = r'\{\{([^}]+)\}\}'
        matches = re.findall(pattern, template)

        for match in matches:
            # Handle default values
            if "|default:" in match:
                field, default = match.split("|default:", 1)
                field = field.strip()
                default = default.strip()
            else:
                field = match.strip()
                default = ""

            # Get the value
            value = self._get_nested_value(data, field, default)

            # Replace in result
            placeholder = "{{" + match + "}}"

            # If the value is a complex type, convert to JSON string
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)
            else:
                value = str(value) if value is not None else default

            result = result.replace(placeholder, value)

        # Try to parse result as JSON if it looks like JSON
        result = result.strip()
        if result.startswith('{') or result.startswith('['):
            try:
                return json.loads(result)
            except json.JSONDecodeError:
                pass

        return result

    def _get_nested_value(self, data: dict, path: str, default: Any = None) -> Any:
        """Get a nested value from a dict using dot notation."""
        keys = path.split('.')
        value = data

        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return default

        return value

    def _to_json(self, data: Any) -> str:
        """Convert data to JSON string."""
        if self.pretty_print:
            return json.dumps(data, indent=2, ensure_ascii=False)
        return json.dumps(data, ensure_ascii=False)

    def _to_xml(self, data: Any) -> str:
        """Convert data to XML string."""
        def dict_to_xml(d: Any, parent_tag: str = None) -> str:
            if isinstance(d, dict):
                items = []
                for key, value in d.items():
                    # Sanitize key for XML tag name
                    tag = re.sub(r'[^a-zA-Z0-9_-]', '_', str(key))
                    items.append(f"<{tag}>{dict_to_xml(value, tag)}</{tag}>")
                return "\n".join(items) if self.pretty_print else "".join(items)
            elif isinstance(d, list):
                item_tag = parent_tag[:-1] if parent_tag and parent_tag.endswith('s') else "item"
                items = [f"<{item_tag}>{dict_to_xml(item, item_tag)}</{item_tag}>" for item in d]
                return "\n".join(items) if self.pretty_print else "".join(items)
            else:
                # Escape XML special characters
                text = str(d) if d is not None else ""
                text = text.replace("&", "&amp;")
                text = text.replace("<", "&lt;")
                text = text.replace(">", "&gt;")
                text = text.replace('"', "&quot;")
                return text

        inner = dict_to_xml(data, self.root_element)

        if self.pretty_print:
            # Indent inner content
            indented = "\n".join("  " + line for line in inner.split("\n"))
            return f'<?xml version="1.0" encoding="UTF-8"?>\n<{self.root_element}>\n{indented}\n</{self.root_element}>'
        return f'<?xml version="1.0" encoding="UTF-8"?><{self.root_element}>{inner}</{self.root_element}>'

    def _to_yaml(self, data: Any) -> str:
        """Convert data to YAML string."""
        def to_yaml_lines(d: Any, indent: int = 0) -> list:
            lines = []
            prefix = "  " * indent

            if isinstance(d, dict):
                for key, value in d.items():
                    if isinstance(value, (dict, list)):
                        lines.append(f"{prefix}{key}:")
                        lines.extend(to_yaml_lines(value, indent + 1))
                    else:
                        yaml_value = self._yaml_value(value)
                        lines.append(f"{prefix}{key}: {yaml_value}")
            elif isinstance(d, list):
                for item in d:
                    if isinstance(item, (dict, list)):
                        lines.append(f"{prefix}-")
                        lines.extend(to_yaml_lines(item, indent + 1))
                    else:
                        yaml_value = self._yaml_value(item)
                        lines.append(f"{prefix}- {yaml_value}")
            else:
                lines.append(f"{prefix}{self._yaml_value(d)}")

            return lines

        return "\n".join(to_yaml_lines(data))

    def _yaml_value(self, value: Any) -> str:
        """Convert a value to YAML format."""
        if value is None:
            return "null"
        elif isinstance(value, bool):
            return "true" if value else "false"
        elif isinstance(value, (int, float)):
            return str(value)
        elif isinstance(value, str):
            # Quote strings that might be ambiguous
            if (value.lower() in ('true', 'false', 'null', 'yes', 'no', 'on', 'off') or
                value.startswith('{') or value.startswith('[') or
                ':' in value or '#' in value or '\n' in value):
                # Use double quotes and escape
                escaped = value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
                return f'"{escaped}"'
            return value
        return str(value)

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
