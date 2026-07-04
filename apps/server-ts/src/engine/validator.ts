/**
 * Workflow Validator - Pre-execution validation for workflows.
 *
 * Checks for:
 * 1. Required config fields not set
 * 2. Unconnected required input ports
 * 3. Unreachable nodes (not reachable from entry points)
 * 4. Circular reference detection
 * 5. API key not set on LLM/TTS nodes (considering global settings)
 */

import { join } from "node:path";
import { checkInvalidConnections } from "./connection-integrity";
import { GLOBAL_SETTINGS_MAP, loadGlobalSettings } from "./global-settings";
import { SOURCE_NODE_TYPES, resolvePluginDir } from "./plugin-loader";
import { resolvePortId } from "./port-aliases";

// ─── Types ───────────────────────────────────────────────────────

export interface ValidationIssue {
  nodeId: string;
  nodeName: string;
  level: "error" | "warning";
  message: string;
}

interface NodeData {
  id: string;
  type: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
}

interface ConnectionData {
  id: string;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
}

interface WorkflowData {
  nodes: NodeData[];
  connections: ConnectionData[];
}

interface ManifestConfig {
  [key: string]: {
    type: string;
    label?: string;
    required?: boolean;
    default?: unknown;
  };
}

interface ManifestInput {
  id: string;
  type: string;
  description?: string;
}

interface PluginManifest {
  id: string;
  name: string;
  category?: string;
  node?: {
    inputs?: ManifestInput[];
    outputs?: Array<{ id: string; type: string }>;
  };
  config?: ManifestConfig;
}
/** Node types that use API keys (not local-only services) */
const API_KEY_NODE_TYPES = new Set([
  "openai-llm",
  "anthropic-llm",
  "google-llm",
  "mistral-llm",
  "groq-llm",
  "openai-tts",
]);

// ─── Manifest Cache ──────────────────────────────────────────────

const manifestCache = new Map<string, PluginManifest | null>();

async function loadManifest(nodeType: string): Promise<PluginManifest | null> {
  if (manifestCache.has(nodeType)) {
    return manifestCache.get(nodeType) ?? null;
  }

  const pluginDir = resolvePluginDir(nodeType);
  if (!pluginDir) {
    manifestCache.set(nodeType, null);
    return null;
  }
  const manifestPath = join(pluginDir, "manifest.json");

  try {
    const file = Bun.file(manifestPath);
    if (!(await file.exists())) {
      manifestCache.set(nodeType, null);
      return null;
    }
    const manifest = (await file.json()) as PluginManifest;
    manifestCache.set(nodeType, manifest);
    return manifest;
  } catch {
    manifestCache.set(nodeType, null);
    return null;
  }
}

/** Clear manifest cache (useful for testing) */
export function clearManifestCache(): void {
  manifestCache.clear();
}

// ─── Global Settings Loader ──────────────────────────────────────

/** Validation must not crash when the DB is unavailable - fall back to no settings. */
function loadGlobalSettingsSafe(): Record<string, string> {
  try {
    return loadGlobalSettings();
  } catch {
    return {};
  }
}

// ─── Validation Functions ────────────────────────────────────────

/**
 * Core logic for checking required config fields.
 * Shared by both async and sync validation paths.
 */
function checkRequiredConfigCore(
  nodes: NodeData[],
  manifests: Map<string, PluginManifest | null>,
  settings?: Record<string, string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const node of nodes) {
    const manifest = manifests.get(node.type);
    if (!manifest?.config) continue;

    const globalMapping = GLOBAL_SETTINGS_MAP[node.type];

    for (const [key, fieldDef] of Object.entries(manifest.config)) {
      if (!fieldDef.required) continue;

      const value = node.config?.[key];
      const isEmpty = value === undefined || value === null || value === "";

      if (isEmpty) {
        // Skip if a global setting provides this value
        const globalKey = globalMapping?.[key];
        if (globalKey && settings?.[globalKey]) continue;

        issues.push({
          nodeId: node.id,
          nodeName: manifest.name || node.type,
          level: "error",
          message: `必須フィールド「${fieldDef.label || key}」が設定されていません`,
        });
      }
    }
  }

  return issues;
}

/**
 * Check required config fields that are not set on nodes.
 */
async function checkRequiredConfig(
  nodes: NodeData[],
  manifests: Map<string, PluginManifest | null>,
  settings?: Record<string, string>,
): Promise<ValidationIssue[]> {
  return checkRequiredConfigCore(nodes, manifests, settings);
}

/**
 * Check unconnected required input ports.
 * Source nodes (which have no inputs) are skipped.
 */
function checkUnconnectedInputs(
  nodes: NodeData[],
  connections: ConnectionData[],
  manifests: Map<string, PluginManifest | null>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Build a set of connected input ports: "nodeId:portId".
  // Resolve legacy snake_case port IDs (issue #104) the same way the executor
  // does, so a pre-rename connection (e.g. scene_name) is not flagged as
  // unconnected against the manifest's new camelCase input id.
  const connectedInputs = new Set<string>();
  for (const conn of connections) {
    connectedInputs.add(`${conn.to.nodeId}:${resolvePortId(conn.to.port)}`);
  }

  for (const node of nodes) {
    // Skip source nodes - they don't have input connections
    if (SOURCE_NODE_TYPES.has(node.type)) continue;

    const manifest = manifests.get(node.type);
    if (!manifest?.node?.inputs) continue;

    for (const input of manifest.node.inputs) {
      const isConnected = connectedInputs.has(`${node.id}:${input.id}`);
      if (!isConnected) {
        issues.push({
          nodeId: node.id,
          nodeName: manifest.name || node.type,
          level: "warning",
          message: `入力ポート「${input.id}」が接続されていません`,
        });
      }
    }
  }

  return issues;
}

/**
 * Check for unreachable nodes (not reachable from entry points).
 */
function checkUnreachableNodes(
  nodes: NodeData[],
  connections: ConnectionData[],
): ValidationIssue[] {
  if (nodes.length === 0) return [];

  const issues: ValidationIssue[] = [];

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const conn of connections) {
    const fromId = conn.from.nodeId;
    const toId = conn.to.nodeId;
    if (adjacency.has(fromId)) {
      const neighbors = adjacency.get(fromId) ?? [];
      adjacency.set(fromId, neighbors);
      if (!neighbors.includes(toId)) {
        neighbors.push(toId);
      }
    }
  }

  // Find entry points
  const startNodes = nodes.filter((n) => n.type === "start").map((n) => n.id);
  const sourceNodes = nodes.filter((n) => SOURCE_NODE_TYPES.has(n.type)).map((n) => n.id);

  let entryPoints: string[];

  if (startNodes.length > 0 || sourceNodes.length > 0) {
    entryPoints = [...startNodes, ...sourceNodes];
  } else {
    // No start/source nodes - use nodes with no incoming connections
    const incomingCount = new Map<string, number>();
    for (const node of nodes) {
      incomingCount.set(node.id, 0);
    }
    for (const conn of connections) {
      if (incomingCount.has(conn.to.nodeId)) {
        incomingCount.set(conn.to.nodeId, (incomingCount.get(conn.to.nodeId) ?? 0) + 1);
      }
    }
    entryPoints = [...incomingCount.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  }

  if (entryPoints.length === 0) {
    // No entry points at all - warn the user
    return [
      {
        nodeId: nodes[0].id,
        nodeName: "Workflow",
        level: "warning",
        message:
          "エントリーポイントが見つかりません。Startノードまたはソースノードを追加してください",
      },
    ];
  }

  // BFS to find reachable nodes
  const reachable = new Set<string>();
  const queue = [...entryPoints];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) break;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (!reachable.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  // Find unreachable nodes
  for (const node of nodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        nodeId: node.id,
        nodeName: node.type,
        level: "warning",
        message: "このノードはエントリーポイントから到達できません",
      });
    }
  }

  return issues;
}

/**
 * Check for circular references using DFS-based cycle detection.
 */
function checkCircularReferences(
  nodes: NodeData[],
  connections: ConnectionData[],
): ValidationIssue[] {
  if (nodes.length === 0) return [];

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const conn of connections) {
    const fromId = conn.from.nodeId;
    const toId = conn.to.nodeId;
    if (adjacency.has(fromId)) {
      const neighbors = adjacency.get(fromId) ?? [];
      adjacency.set(fromId, neighbors);
      if (!neighbors.includes(toId)) {
        neighbors.push(toId);
      }
    }
  }

  // DFS cycle detection
  const WHITE = 0; // Not visited
  const GRAY = 1; // In current path
  const BLACK = 2; // Fully processed

  const color = new Map<string, number>();
  for (const node of nodes) {
    color.set(node.id, WHITE);
  }

  const cycleNodes = new Set<string>();

  function dfs(nodeId: string): boolean {
    color.set(nodeId, GRAY);

    for (const neighbor of adjacency.get(nodeId) ?? []) {
      const neighborColor = color.get(neighbor) ?? WHITE;
      if (neighborColor === GRAY) {
        // Back edge found - cycle detected
        cycleNodes.add(nodeId);
        cycleNodes.add(neighbor);
        return true;
      }
      if (neighborColor === WHITE) {
        if (dfs(neighbor)) {
          cycleNodes.add(nodeId);
          return true;
        }
      }
    }

    color.set(nodeId, BLACK);
    return false;
  }

  for (const node of nodes) {
    if (color.get(node.id) === WHITE) {
      dfs(node.id);
    }
  }

  if (cycleNodes.size > 0) {
    return [
      {
        nodeId: [...cycleNodes][0],
        nodeName: "Workflow",
        level: "error",
        message: `循環参照が検出されました（関連ノード: ${cycleNodes.size}個）`,
      },
    ];
  }

  return [];
}

/**
 * Check API key settings on LLM/TTS nodes, considering global settings fallback.
 */
function checkApiKeys(nodes: NodeData[], settings: Record<string, string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const node of nodes) {
    if (!API_KEY_NODE_TYPES.has(node.type)) continue;

    const mapping = GLOBAL_SETTINGS_MAP[node.type];
    if (!mapping?.apiKey) continue;

    const nodeApiKey = node.config?.apiKey;
    const globalApiKey = settings[mapping.apiKey];

    const nodeKeyEmpty = nodeApiKey === undefined || nodeApiKey === null || nodeApiKey === "";
    const globalKeyEmpty = !globalApiKey || globalApiKey === "";

    if (nodeKeyEmpty && globalKeyEmpty) {
      issues.push({
        nodeId: node.id,
        nodeName: node.type,
        level: "warning",
        message: "APIキーが設定されていません（ノード設定またはグローバル設定で設定してください）",
      });
    }
  }

  return issues;
}

// ─── Main Validation Function ────────────────────────────────────

/**
 * Validate a workflow and return all issues found.
 */
export async function validateWorkflow(workflowData: WorkflowData): Promise<ValidationIssue[]> {
  const { nodes, connections } = workflowData;

  if (!nodes || nodes.length === 0) {
    return [];
  }

  // Load manifests for all node types
  const manifests = new Map<string, PluginManifest | null>();
  const uniqueTypes = new Set(nodes.map((n) => n.type));
  for (const nodeType of uniqueTypes) {
    manifests.set(nodeType, await loadManifest(nodeType));
  }

  // Load global settings for API key check
  const settings = loadGlobalSettingsSafe();

  // Run all checks
  const issues: ValidationIssue[] = [];

  // 1. Required config fields
  issues.push(...(await checkRequiredConfig(nodes, manifests, settings)));

  // 2. Unconnected required input ports
  issues.push(...checkUnconnectedInputs(nodes, connections, manifests));

  // 3. Unreachable nodes
  issues.push(...checkUnreachableNodes(nodes, connections));

  // 4. Circular references
  issues.push(...checkCircularReferences(nodes, connections));

  // 5. API key check
  issues.push(...checkApiKeys(nodes, settings));

  // 6. Invalid connections (port direction / existence / type compatibility)
  issues.push(...checkInvalidConnections(nodes, connections, manifests, resolvePortId));

  return issues;
}

/**
 * Validate workflow data without loading manifests from disk.
 * Useful for testing or when manifests are pre-loaded.
 */
export function validateWorkflowSync(
  workflowData: WorkflowData,
  manifests: Map<string, PluginManifest | null>,
  settings: Record<string, string> = {},
): ValidationIssue[] {
  const { nodes, connections } = workflowData;

  if (!nodes || nodes.length === 0) {
    return [];
  }

  const issues: ValidationIssue[] = [];

  // 1. Required config fields (using shared core logic)
  issues.push(...checkRequiredConfigCore(nodes, manifests, settings));

  // 2. Unconnected required input ports
  issues.push(...checkUnconnectedInputs(nodes, connections, manifests));

  // 3. Unreachable nodes
  issues.push(...checkUnreachableNodes(nodes, connections));

  // 4. Circular references
  issues.push(...checkCircularReferences(nodes, connections));

  // 5. API key check
  issues.push(...checkApiKeys(nodes, settings));

  // 6. Invalid connections (port direction / existence / type compatibility)
  issues.push(...checkInvalidConnections(nodes, connections, manifests, resolvePortId));

  return issues;
}
