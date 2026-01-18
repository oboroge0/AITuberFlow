"""
OpenAI LLM Node

Generates text responses using OpenAI's GPT models.
"""

import sys
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext, Event

try:
    import openai
except ImportError:
    openai = None


class OpenAILLMNode(BaseNode):
    """
    OpenAI LLM Node

    Generates text responses using OpenAI's chat completion API.
    """

    def __init__(self):
        self.client = None
        self.api_key = None
        self.model = "gpt-4o-mini"
        self.system_prompt = "You are a helpful assistant."
        self.temperature = 0.7
        self.max_tokens = 1024

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize the OpenAI client."""
        if openai is None:
            await context.log("OpenAI package not installed. Run: pip install openai", "error")
            return

        self.api_key = config.get("apiKey")
        self.model = config.get("model", "gpt-4o-mini")
        self.system_prompt = config.get("systemPrompt", "You are a helpful assistant.")
        self.temperature = config.get("temperature", 0.7)
        self.max_tokens = config.get("maxTokens", 1024)

        if not self.api_key:
            await context.log("OpenAI API key not configured", "warning")
        else:
            self.client = openai.AsyncOpenAI(api_key=self.api_key)
            await context.log(f"OpenAI client initialized (model: {self.model})")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Generate a response from the model."""
        if not self.client:
            await context.log("OpenAI client not initialized", "error")
            return {"response": "Error: OpenAI client not initialized"}

        prompt = inputs.get("prompt", "")
        if not prompt:
            await context.log("No prompt provided", "warning")
            return {"response": ""}

        try:
            await context.log(f"Calling OpenAI API ({self.model})...")

            # Include character personality in system prompt
            character_name = context.get_character_name()
            character_personality = context.get_character_personality()

            full_system_prompt = self.system_prompt
            if character_personality:
                full_system_prompt = f"{self.system_prompt}\n\nYou are {character_name}. {character_personality}"

            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": full_system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )

            result = response.choices[0].message.content
            await context.log(f"Response received ({len(result)} chars)")

            # Emit event for response generated
            await context.emit_event(Event(
                type="response.generated",
                payload={"text": result, "model": self.model}
            ))

            return {"response": result}

        except openai.APIConnectionError:
            await context.log("Failed to connect to OpenAI API", "error")
            return {"response": "Error: Connection failed"}

        except openai.RateLimitError:
            await context.log("OpenAI API rate limit exceeded", "error")
            return {"response": "Error: Rate limit exceeded"}

        except openai.APIStatusError as e:
            await context.log(f"OpenAI API error: {e.message}", "error")
            return {"response": f"Error: {e.message}"}

        except Exception as e:
            await context.log(f"Unexpected error: {str(e)}", "error")
            return {"response": f"Error: {str(e)}"}

    async def teardown(self) -> None:
        """Clean up resources."""
        self.client = None
