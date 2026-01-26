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

    # Demo mode response
    DEMO_RESPONSE = "これはデモモードの応答です。実際のLLMを使用するにはOllamaを起動してください。"

    def __init__(self):
        self.host = "http://localhost:11434"
        self.model = "llama3.2"
        self.system_prompt = "You are a helpful assistant."
        self.temperature = 0.7
        self.context_length = 4096
        self.connection_available = True

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.host = config.get("host", "http://localhost:11434")
        self.model = config.get("model", "llama3.2")
        self.system_prompt = config.get("systemPrompt", "You are a helpful assistant.")
        self.temperature = config.get("temperature", 0.7)
        self.context_length = config.get("contextLength", 4096)

        # Test connection - auto demo mode if unavailable
        if aiohttp:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(f"{self.host.rstrip('/')}/api/tags", timeout=aiohttp.ClientTimeout(total=5)) as response:
                        if response.status == 200:
                            self.connection_available = True
                            await context.log(f"Ollama connected: {self.model} at {self.host}")
                        else:
                            self.connection_available = False
                            await context.log(f"[デモモード] Ollama接続テスト失敗 - 定型文応答を返します", "warning")
            except Exception as e:
                self.connection_available = False
                await context.log(f"[デモモード] Ollamaに接続できません ({self.host}) - 定型文応答を返します", "warning")
        else:
            await context.log(f"Ollama configured: {self.model} at {self.host}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Generate a response using Ollama."""
        prompt = inputs.get("prompt", "")

        if not prompt:
            await context.log("No prompt provided", "warning")
            return {"response": ""}

        # Auto demo mode: return placeholder response if connection is unavailable
        if not self.connection_available:
            await context.log("[デモモード] 定型文応答を返します", "info")
            return {"response": self.DEMO_RESPONSE}

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
