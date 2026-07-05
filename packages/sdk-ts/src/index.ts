/**
 * AITuberFlow Plugin SDK for TypeScript
 *
 * @module @aituber-flow/sdk
 */

// Base node classes
export { BaseNode, InputNode, ProcessNode, OutputNode } from "./base";

// Context and events
export { NodeContext, createEvent } from "./context";
export type { Event, NodeContextOptions, MemoryRecord, SearchMemoriesOptions } from "./context";

// Type definitions and Zod schemas
export {
  PortDefinitionSchema,
  ConfigFieldSchema,
  PluginAuthorSchema,
  PluginNodeDefinitionSchema,
  PluginManifestSchema,
  MessageSchema,
  EmotionSchema,
  MemorySchema,
  CharacterStateSchema,
  StreamMessageSchema,
  StreamContextSchema,
} from "./types";
export type {
  PortDefinition,
  ConfigField,
  PluginAuthor,
  PluginNodeDefinition,
  PluginManifest,
  Message,
  Emotion,
  Memory,
  CharacterState,
  StreamMessage,
  StreamContext,
} from "./types";

// Audio utilities
export { getWavDuration } from "./audio-utils";

// Error system
export {
  ErrorCode,
  NodeExecutionError,
  NodeConfigError,
  NodeConnectionError,
  getErrorMessage,
  formatErrorWithAction,
} from "./errors";

// LLM error utilities
export { handleLLMError, classifyLLMError, resolveSystemPrompt, LLMError } from "./llm-utils";
export type { LLMErrorCategory } from "./llm-utils";
