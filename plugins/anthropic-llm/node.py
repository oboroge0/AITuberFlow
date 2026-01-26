"""
Anthropic Claude LLM Node

Generates text using Anthropic's Claude models.
"""

import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext

try:
    import anthropic
except ImportError:
    anthropic = None


class AnthropicLLMNode(BaseNode):
    """
    Anthropic Claude LLM Node

    Generates text responses using Claude models.
    """

    # Demo mode response
    DEMO_RESPONSE = "これはデモモードの応答です。実際のLLMを使用するにはAPIキーを設定してください。"

    def __init__(self):
        self.api_key = ""
        self.model = "claude-3-haiku-20240307"
        self.system_prompt = "You are a helpful assistant."
        self.max_tokens = 1024
        self.temperature = 0.7
        self.client = None

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.api_key = config.get("apiKey", "")
        self.model = config.get("model", "claude-3-haiku-20240307")
        self.system_prompt = config.get("systemPrompt", "You are a helpful assistant.")
        self.max_tokens = config.get("maxTokens", 1024)
        self.temperature = config.get("temperature", 0.7)

        if not self.api_key:
            # Auto demo mode when API key is not set
            await context.log("[デモモード] Anthropic APIキー未設定 - 定型文応答を返します", "warning")
        else:
            await context.log(f"Claude configured: {self.model}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Generate a response using Claude."""
        prompt = inputs.get("prompt", "")

        if not prompt:
            await context.log("No prompt provided", "warning")
            return {"response": ""}

        # Auto demo mode when API key is not set
        if not self.api_key:
            await context.log("[デモモード] 定型文応答を返します", "info")
            return {"response": self.DEMO_RESPONSE}

        if anthropic is None:
            await context.log("anthropic package not installed", "error")
            return {"response": "Error: anthropic package not installed. Run: pip install anthropic"}

        try:
            await context.log(f"Calling Claude API ({self.model})...")

            client = anthropic.Anthropic(api_key=self.api_key)

            message = client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=self.system_prompt,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            response = message.content[0].text
            await context.log(f"Response received ({len(response)} chars)")

            return {"response": response}

        except Exception as e:
            await context.log(f"Claude API error: {str(e)}", "error")
            return {"response": f"Error: {str(e)}"}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
