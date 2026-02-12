/**
 * Type definitions for AITuberFlow Plugin SDK.
 *
 * Provides both Zod schemas for runtime validation and
 * TypeScript interfaces for compile-time type checking.
 */

import { z } from "zod";

// ─── Port Definition ─────────────────────────────────────────────

export const PortDefinitionSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string().optional(),
});

export type PortDefinition = z.infer<typeof PortDefinitionSchema>;

// ─── Config Field ────────────────────────────────────────────────

export const ConfigFieldSchema = z.object({
  type: z.enum(["string", "number", "boolean", "select", "textarea"]),
  label: z.string(),
  description: z.string().optional(),
  required: z.boolean().default(false),
  default: z.any().optional(),
  options: z.array(z.record(z.any())).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export type ConfigField = z.infer<typeof ConfigFieldSchema>;

// ─── Plugin Author ───────────────────────────────────────────────

export const PluginAuthorSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
});

export type PluginAuthor = z.infer<typeof PluginAuthorSchema>;

// ─── Plugin Node Definition ──────────────────────────────────────

export const PluginNodeDefinitionSchema = z.object({
  inputs: z.array(PortDefinitionSchema).default([]),
  outputs: z.array(PortDefinitionSchema).default([]),
  events: z.record(z.array(z.string())).optional(),
});

export type PluginNodeDefinition = z.infer<typeof PluginNodeDefinitionSchema>;

// ─── Plugin Manifest ─────────────────────────────────────────────

export const PluginManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: PluginAuthorSchema,
  license: z.string().default("MIT"),
  category: z.enum(["input", "process", "output", "control"]),
  node: PluginNodeDefinitionSchema,
  config: z.record(ConfigFieldSchema).default({}),
  dependencies: z.record(z.array(z.string())).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// ─── Message ─────────────────────────────────────────────────────

export const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  author: z.string().optional(),
  timestamp: z.string().default(() => new Date().toISOString()),
  metadata: z.record(z.any()).optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// ─── Emotion ─────────────────────────────────────────────────────

export const EmotionSchema = z.object({
  current: z.string().default("neutral"),
  intensity: z.number().default(0.5),
});

export type Emotion = z.infer<typeof EmotionSchema>;

// ─── Memory ──────────────────────────────────────────────────────

export const MemorySchema = z.object({
  id: z.string(),
  content: z.string(),
  timestamp: z.string().default(() => new Date().toISOString()),
});

export type Memory = z.infer<typeof MemorySchema>;

// ─── Character State ─────────────────────────────────────────────

export const CharacterStateSchema = z.object({
  name: z.string().default("AI Assistant"),
  personality: z.string().default("Friendly and helpful"),
  emotion: EmotionSchema.default({ current: "neutral", intensity: 0.5 }),
  shortTermMemory: z.array(MessageSchema).default([]),
  longTermMemory: z.array(MemorySchema).default([]),
  currentTopic: z.string().optional(),
  lastSpokeAt: z.string().optional(),
});

export type CharacterState = z.infer<typeof CharacterStateSchema>;

// ─── Stream Message ──────────────────────────────────────────────

export const StreamMessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  author: z.string(),
  timestamp: z.string().default(() => new Date().toISOString()),
  superchatAmount: z.number().optional(),
  superchatCurrency: z.string().optional(),
  isMember: z.boolean().default(false),
});

export type StreamMessage = z.infer<typeof StreamMessageSchema>;

// ─── Stream Context ──────────────────────────────────────────────

export const StreamContextSchema = z.object({
  platform: z.string().optional(),
  videoId: z.string().optional(),
  channelId: z.string().optional(),
  viewerCount: z.number().default(0),
  likeCount: z.number().default(0),
  messageQueue: z.array(StreamMessageSchema).default([]),
  superchatQueue: z.array(StreamMessageSchema).default([]),
  streamStartedAt: z.string().optional(),
  lastMessageAt: z.string().optional(),
  silenceDuration: z.number().default(0),
});

export type StreamContext = z.infer<typeof StreamContextSchema>;
