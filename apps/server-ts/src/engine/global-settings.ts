/**
 * Global settings shared by the executor and the validator.
 *
 * Single source of truth for which node config fields can be filled in
 * from global settings when left empty on the node itself.
 */
import { db } from "../db/database";
import { globalSettings } from "../db/schema";

/**
 * Maps node types to their config fields and corresponding global setting keys.
 * When a node's config field is empty, the global setting value is used instead.
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

export function loadGlobalSettings(): Record<string, string> {
  const rows = db.select().from(globalSettings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function mergeGlobalSettings(
  nodeType: string,
  config: Record<string, unknown>,
  settings: Record<string, string>,
): Record<string, unknown> {
  const mapping = GLOBAL_SETTINGS_MAP[nodeType];
  if (!mapping) return config;

  const merged = { ...config };
  for (const [configField, settingsKey] of Object.entries(mapping)) {
    const currentValue = merged[configField];
    if (
      (currentValue === undefined || currentValue === null || currentValue === "") &&
      settings[settingsKey]
    ) {
      merged[configField] = settings[settingsKey];
    }
  }
  return merged;
}
