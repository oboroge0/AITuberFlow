/**
 * Maps node types to their config fields and corresponding global setting keys.
 * When a node's config field is empty, the engine fills it from global settings.
 *
 * Mirrors the server-side source of truth:
 * apps/server-ts/src/engine/global-settings.ts
 */
export const GLOBAL_SETTINGS_MAP: Record<string, Record<string, string>> = {
  "openai-llm": { apiKey: "openai.apiKey", model: "openai.model" },
  "anthropic-llm": { apiKey: "anthropic.apiKey", model: "anthropic.model" },
  "google-llm": { apiKey: "google.apiKey", model: "google.model" },
  "ollama-llm": { host: "ollama.host", model: "ollama.model" },
  "mistral-llm": { apiKey: "mistral.apiKey", model: "mistral.model" },
  "groq-llm": { apiKey: "groq.apiKey", model: "groq.model" },
  "voicevox-tts": { host: "voicevox.host" },
  "coeiroink-tts": { host: "coeiroink.host" },
  "sbv2-tts": { host: "sbv2.host" },
  "aivis-tts": { host: "aivis.host" },
  "openai-tts": { apiKey: "openai.apiKey" },
};
