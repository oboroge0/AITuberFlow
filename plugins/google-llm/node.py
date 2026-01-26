"""
Google Gemini LLM Node

Generates text using Google's Gemini models.
"""

import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext

try:
    import google.generativeai as genai
except ImportError:
    genai = None


class GoogleLLMNode(BaseNode):
    """
    Google Gemini LLM Node

    Generates text responses using Gemini models.
    """

    # Demo mode response
    DEMO_RESPONSE = "これはデモモードの応答です。実際のLLMを使用するにはAPIキーを設定してください。"

    def __init__(self):
        self.api_key = ""
        self.model = "gemini-1.5-flash"
        self.system_prompt = "You are a helpful assistant."
        self.max_tokens = 1024
        self.temperature = 0.7

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.api_key = config.get("apiKey", "")
        self.model = config.get("model", "gemini-1.5-flash")
        self.system_prompt = config.get("systemPrompt", "You are a helpful assistant.")
        self.max_tokens = config.get("maxTokens", 1024)
        self.temperature = config.get("temperature", 0.7)

        if not self.api_key:
            # Auto demo mode when API key is not set
            await context.log("[デモモード] Google AI APIキー未設定 - 定型文応答を返します", "warning")
        else:
            if genai:
                genai.configure(api_key=self.api_key)
            await context.log(f"Gemini configured: {self.model}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Generate a response using Gemini."""
        prompt = inputs.get("prompt", "")

        if not prompt:
            await context.log("No prompt provided", "warning")
            return {"response": ""}

        # Auto demo mode when API key is not set
        if not self.api_key:
            await context.log("[デモモード] 定型文応答を返します", "info")
            return {"response": self.DEMO_RESPONSE}

        if genai is None:
            await context.log("google-generativeai package not installed", "error")
            return {"response": "Error: google-generativeai not installed. Run: pip install google-generativeai"}

        try:
            await context.log(f"Calling Gemini API ({self.model})...")

            model = genai.GenerativeModel(
                model_name=self.model,
                system_instruction=self.system_prompt,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=self.max_tokens,
                    temperature=self.temperature,
                )
            )

            response = model.generate_content(prompt)
            result = response.text
            await context.log(f"Response received ({len(result)} chars)")

            return {"response": result}

        except Exception as e:
            await context.log(f"Gemini API error: {str(e)}", "error")
            return {"response": f"Error: {str(e)}"}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
