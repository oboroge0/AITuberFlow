import { z } from "zod";

// ─── Primitives ─────────────────────────────────────────────────

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const eventFilterSchema = z.object({
  event: z.string(),
  condition: z.string().optional(),
});

// ─── Node & Connection ──────────────────────────────────────────

export const nodeModelSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: positionSchema,
  config: z.record(z.any()).default({}),
  eventFilters: z.array(eventFilterSchema).optional(),
});

export const connectionEndpointSchema = z.object({
  nodeId: z.string(),
  port: z.string(),
});

export const connectionModelSchema = z.object({
  id: z.string(),
  from: connectionEndpointSchema,
  to: connectionEndpointSchema,
});

// ─── Character ──────────────────────────────────────────────────

export const characterConfigSchema = z.object({
  name: z.string().default("AI Assistant"),
  personality: z.string().default("Friendly and helpful virtual streamer"),
});

// ─── Workflow CRUD ──────────────────────────────────────────────

export const workflowCreateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  nodes: z.array(nodeModelSchema).default([]),
  connections: z.array(connectionModelSchema).default([]),
  character: characterConfigSchema.default({}),
});

export const workflowUpdateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  nodes: z.array(nodeModelSchema).optional(),
  connections: z.array(connectionModelSchema).optional(),
  character: characterConfigSchema.optional(),
});

export const workflowResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  nodes: z.array(nodeModelSchema).default([]),
  connections: z.array(connectionModelSchema).default([]),
  character: characterConfigSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Execution ──────────────────────────────────────────────────

export const executionStatusSchema = z.object({
  workflowId: z.string(),
  status: z.enum(["idle", "running", "stopped", "error"]),
  startedAt: z.string().optional(),
  error: z.string().optional(),
});

export const executionRequestSchema = z.object({
  nodes: z.array(nodeModelSchema).optional(),
  connections: z.array(connectionModelSchema).optional(),
  character: characterConfigSchema.optional(),
  startNodeId: z.string().optional(),
});

// ─── Inferred Types ─────────────────────────────────────────────

export type Position = z.infer<typeof positionSchema>;
export type EventFilter = z.infer<typeof eventFilterSchema>;
export type NodeModel = z.infer<typeof nodeModelSchema>;
export type ConnectionEndpoint = z.infer<typeof connectionEndpointSchema>;
export type ConnectionModel = z.infer<typeof connectionModelSchema>;
export type CharacterConfig = z.infer<typeof characterConfigSchema>;
export type WorkflowCreate = z.infer<typeof workflowCreateSchema>;
export type WorkflowUpdate = z.infer<typeof workflowUpdateSchema>;
export type WorkflowResponse = z.infer<typeof workflowResponseSchema>;
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;
