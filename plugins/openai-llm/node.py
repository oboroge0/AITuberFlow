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

from aituber_flow_sdk import BaseNode, NodeContext, Event, ErrorCode, get_error_message

try:
    import openai
except ImportError:
    openai = None


class OpenAILLMNode(BaseNode):
    """
    OpenAI LLM Node

    Generates text responses using OpenAI's chat completion API.
    """

    # Demo mode response
    DEMO_RESPONSE = "これはデモモードの応答です。実際のLLMを使用するにはAPIキーを設定してください。"

    def __init__(self):
        self.client = None
        self.api_key = None
        self.model = "gpt-4o-mini"
        self.system_prompt = "You are a helpful assistant."
        self.temperature = 0.7
        self.max_tokens = 1024
        self.prompt_sections = None  # For structured prompt building

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize the OpenAI client."""
        if openai is None:
            error_msg = get_error_message(ErrorCode.PACKAGE_NOT_INSTALLED, package="openai")
            await context.log(error_msg, "error")
            return

        self.api_key = config.get("apiKey")
        self.model = config.get("model", "gpt-4o-mini")
        self.system_prompt = config.get("systemPrompt", "You are a helpful assistant.")
        self.temperature = config.get("temperature", 0.7)
        self.max_tokens = config.get("maxTokens", 1024)
        self.prompt_sections = config.get("promptSections")  # Structured prompt config

        if not self.api_key:
            # Auto demo mode when API key is not set
            await context.log("[デモモード] OpenAI APIキー未設定 - 定型文応答を返します", "warning")
        else:
            self.client = openai.AsyncOpenAI(api_key=self.api_key)
            await context.log(f"OpenAI client initialized (model: {self.model})")

    def _build_prompt_from_sections(self, inputs: dict) -> str:
        """Build prompt from sections configuration."""
        if not self.prompt_sections:
            return inputs.get("prompt", "")

        parts = []
        for section in self.prompt_sections:
            section_type = section.get("type")
            content = section.get("content", "")

            if section_type == "text":
                # Static text block
                parts.append(content)
            elif section_type == "input":
                # Dynamic input from connection - content is the port name
                input_value = inputs.get(content, "")
                # Handle objects by extracting common fields
                if isinstance(input_value, dict):
                    # Try to extract message or text field, common in chat inputs
                    if "message" in input_value:
                        input_value = input_value["message"]
                    elif "text" in input_value:
                        input_value = input_value["text"]
                    else:
                        # Convert to string representation
                        input_value = str(input_value)
                parts.append(str(input_value) if input_value else "")

        return "\n".join(parts)

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Generate a response from the model."""
        # Auto demo mode when client is not initialized (no API key)
        if not self.client:
            await context.log("[デモモード] 定型文応答を返します", "info")
            return {"response": self.DEMO_RESPONSE}

        # Build prompt from sections or use simple prompt input
        if self.prompt_sections:
            prompt = self._build_prompt_from_sections(inputs)
        else:
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
            error_msg = get_error_message(ErrorCode.LLM_CONNECTION_FAILED, provider="OpenAI")
            await context.log(error_msg, "error")
            return {"response": "Error: Connection failed"}

        except openai.RateLimitError:
            error_msg = get_error_message(ErrorCode.LLM_RATE_LIMIT, provider="OpenAI")
            await context.log(error_msg, "error")
            return {"response": "Error: Rate limit exceeded"}

        except openai.APIStatusError as e:
            error_msg = get_error_message(ErrorCode.LLM_API_ERROR, provider="OpenAI", error=e.message)
            await context.log(error_msg, "error")
            return {"response": f"Error: {e.message}"}

        except Exception as e:
            await context.log(f"Unexpected error: {str(e)}", "error")
            return {"response": f"Error: {str(e)}"}

    async def teardown(self) -> None:
        """Clean up resources."""
        self.client = None
