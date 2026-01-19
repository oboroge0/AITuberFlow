"""
Ollama LLM Node

Generates text using Ollama local LLM server.
"""

import sys
import json
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext

try:
    import aiohttp
except ImportError:
    aiohttp = None


class OllamaLLMNode(BaseNode):
    """
    Ollama LLM Node

    Generates text responses using local Ollama server.
    """

    def __init__(self):
        self.host = "http://localhost:11434"
        self.model = "llama3.2"
        self.system_prompt = "You are a helpful assistant."
        self.temperature = 0.7
        self.context_length = 4096

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.host = config.get("host", "http://localhost:11434")
        self.model = config.get("model", "llama3.2")
        self.system_prompt = config.get("systemPrompt", "You are a helpful assistant.")
        self.temperature = config.get("temperature", 0.7)
        self.context_length = config.get("contextLength", 4096)

        await context.log(f"Ollama configured: {self.model} at {self.host}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Generate a response using Ollama."""
        prompt = inputs.get("prompt", "")

        if not prompt:
            await context.log("No prompt provided", "warning")
            return {"response": ""}

        if aiohttp is None:
            # Fallback to urllib
            return await self._execute_urllib(prompt, context)

        try:
            await context.log(f"Calling Ollama API ({self.model})...")

            url = f"{self.host.rstrip('/')}/api/generate"

            payload = {
                "model": self.model,
                "prompt": prompt,
                "system": self.system_prompt,
                "stream": False,
                "options": {
                    "temperature": self.temperature,
                    "num_ctx": self.context_length,
                }
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        await context.log(f"Ollama error: {error_text}", "error")
                        return {"response": f"Error: {error_text}"}

                    data = await response.json()
                    result = data.get("response", "")
                    await context.log(f"Response received ({len(result)} chars)")
                    return {"response": result}

        except Exception as e:
            await context.log(f"Ollama error: {str(e)}", "error")
            return {"response": f"Error: {str(e)}"}

    async def _execute_urllib(self, prompt: str, context: NodeContext) -> dict:
        """Fallback using urllib."""
        import urllib.request
        import urllib.error

        try:
            await context.log(f"Calling Ollama API ({self.model}) via urllib...")

            url = f"{self.host.rstrip('/')}/api/generate"

            payload = {
                "model": self.model,
                "prompt": prompt,
                "system": self.system_prompt,
                "stream": False,
                "options": {
                    "temperature": self.temperature,
                    "num_ctx": self.context_length,
                }
            }

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'},
                method='POST'
            )

            with urllib.request.urlopen(req, timeout=120) as response:
                data = json.loads(response.read().decode('utf-8'))
                result = data.get("response", "")
                await context.log(f"Response received ({len(result)} chars)")
                return {"response": result}

        except urllib.error.HTTPError as e:
            await context.log(f"Ollama HTTP error: {e.code}", "error")
            return {"response": f"Error: HTTP {e.code}"}
        except Exception as e:
            await context.log(f"Ollama error: {str(e)}", "error")
            return {"response": f"Error: {str(e)}"}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
