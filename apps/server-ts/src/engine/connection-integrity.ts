/**
 * Connection integrity checks for workflow validation.
 *
 * The engine resolves node inputs in executor.ts `getNodeInputs` with a very
 * tolerant rule: if a connection's source port is not found on the upstream
 * node's output object, it silently passes the *entire* upstream output object
 * downstream, and a target port that does not exist is simply written as a key.
 * As a result none of the following are caught at run time:
 *   - connecting an OUTPUT port to another OUTPUT port (reversed direction)
 *   - connecting to/from a port id that does not exist on the node
 *   - mismatched port types
 *
 * The visual editor's `isValidConnection` only blocks *type*-incompatible drags
 * and even then allows unknown ports, and does nothing for workflows created via
 * the API / import / DB. This module adds manifest-based connection checks so
 * malformed graphs are surfaced before they fail silently.
 *
 * Severity (decided with the maintainer):
 *   - reversed direction / non-existent port on a node that HAS ports → error
 *   - any connection touching a node that declares NO ports (e.g.
 *     avatar-configuration, which is event-driven) → warning (it is a no-op)
 *   - type mismatch → warning
 *
 * False-positive avoidance:
 *   - endpoints whose node has no manifest are skipped
 *   - the `to` side of a node with dynamic input ports (config containing a
 *     prompt-builder / input-list field, e.g. openai-llm / text-transform) is
 *     skipped, because those inputs are generated from config at edit time and
 *     are not present in the static manifest. Must stay in sync with the dynamic
 *     port generation in apps/web/components/editor/Canvas.tsx.
 */

import type { ValidationIssue } from "./validator";

interface NodeLike {
  id: string;
  type: string;
  config?: Record<string, unknown>;
}

interface ConnectionLike {
  id: string;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
}

interface ManifestPort {
  id: string;
  type: string;
}

interface ManifestLike {
  id: string;
  name: string;
  category?: string;
  node?: {
    inputs?: ManifestPort[];
    outputs?: ManifestPort[];
  };
  config?: Record<string, { type: string }>;
}

/** Port types the validator models; anything else is treated as compatible. */
const KNOWN_PORT_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "audio",
  "array",
  "object",
  "any",
  "trigger",
]);

/**
 * Mirror of the frontend arePortTypesCompatible (apps/web/lib/portTypes.ts):
 * compatible if either side is 'any', either side is a type the validator does
 * not model, or the two types are exactly equal.
 */
function arePortTypesCompatible(sourceType: string, targetType: string): boolean {
  if (sourceType === "any" || targetType === "any") return true;
  if (!KNOWN_PORT_TYPES.has(sourceType) || !KNOWN_PORT_TYPES.has(targetType)) {
    return true;
  }
  return sourceType === targetType;
}

/**
 * Config field types whose presence makes a node's INPUT ports dynamic
 * (generated from config at edit time, not declared in the manifest).
 * Keep in sync with Canvas.tsx dynamic port generation.
 */
const DYNAMIC_INPUT_CONFIG_TYPES = new Set(["prompt-builder", "input-list"]);

function hasDynamicInputs(manifest: ManifestLike | null | undefined): boolean {
  if (!manifest?.config) return false;
  return Object.values(manifest.config).some((field) =>
    DYNAMIC_INPUT_CONFIG_TYPES.has(field?.type),
  );
}

function inputsOf(manifest: ManifestLike | null | undefined): ManifestPort[] {
  return manifest?.node?.inputs ?? [];
}

function outputsOf(manifest: ManifestLike | null | undefined): ManifestPort[] {
  return manifest?.node?.outputs ?? [];
}

function hasNoPorts(manifest: ManifestLike | null | undefined): boolean {
  return inputsOf(manifest).length === 0 && outputsOf(manifest).length === 0;
}

/**
 * Validate every connection against the source/target node manifests.
 *
 * @param nodes        workflow nodes
 * @param connections  workflow connections
 * @param manifests    node type → manifest (or null when not found)
 * @param resolvePortId optional legacy port-id alias resolver (e.g. snake→camel
 *   after the config-naming refactor). Defaults to identity so this works on a
 *   tree that has no alias table.
 */
export function checkInvalidConnections(
  nodes: NodeLike[],
  connections: ConnectionLike[],
  manifests: Map<string, ManifestLike | null>,
  resolvePortId: (port: string) => string = (p) => p,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  // Emit the "node has no ports" warning at most once per node, not per edge.
  const warnedNoPortNodes = new Set<string>();

  const nameOf = (node: NodeLike): string =>
    manifests.get(node.type)?.name || node.type;

  const warnNoPorts = (node: NodeLike): void => {
    if (warnedNoPortNodes.has(node.id)) return;
    warnedNoPortNodes.add(node.id);
    issues.push({
      nodeId: node.id,
      nodeName: nameOf(node),
      level: "warning",
      message: `「${nameOf(node)}」は入出力ポートを持たないため、この接続は無視されます`,
    });
  };

  for (const conn of connections) {
    const fromNode = nodeById.get(conn.from.nodeId);
    const toNode = nodeById.get(conn.to.nodeId);

    // Dangling connection: references a node that is not in the workflow.
    if (!fromNode || !toNode) {
      const missingId = !fromNode ? conn.from.nodeId : conn.to.nodeId;
      issues.push({
        nodeId: missingId,
        nodeName: missingId,
        level: "error",
        message: `接続が存在しないノード「${missingId}」を参照しています`,
      });
      continue;
    }

    const fromManifest = manifests.get(fromNode.type);
    const toManifest = manifests.get(toNode.type);
    const fromPort = resolvePortId(conn.from.port);
    const toPort = resolvePortId(conn.to.port);

    // ── Source endpoint must reference an OUTPUT port of fromNode ──
    if (fromManifest) {
      if (hasNoPorts(fromManifest)) {
        warnNoPorts(fromNode);
      } else if (!outputsOf(fromManifest).some((p) => p.id === fromPort)) {
        const isInput = inputsOf(fromManifest).some((p) => p.id === fromPort);
        issues.push({
          nodeId: fromNode.id,
          nodeName: nameOf(fromNode),
          level: "error",
          message: isInput
            ? `接続元が入力ポート「${conn.from.port}」になっています（出力ポートから接続してください）`
            : `接続元の出力ポート「${conn.from.port}」が存在しません`,
        });
      }
    }

    // ── Target endpoint must reference an INPUT port of toNode ──
    // Skip nodes with dynamic inputs (their inputs aren't in the manifest).
    if (toManifest && !hasDynamicInputs(toManifest)) {
      if (hasNoPorts(toManifest)) {
        warnNoPorts(toNode);
      } else if (!inputsOf(toManifest).some((p) => p.id === toPort)) {
        const isOutput = outputsOf(toManifest).some((p) => p.id === toPort);
        issues.push({
          nodeId: toNode.id,
          nodeName: nameOf(toNode),
          level: "error",
          message: isOutput
            ? `接続先が出力ポート「${conn.to.port}」になっています（入力ポートへ接続してください）`
            : `接続先の入力ポート「${conn.to.port}」が存在しません`,
        });
      }
    }

    // ── Type compatibility (warning) — only when both ends resolve cleanly ──
    if (
      fromManifest &&
      toManifest &&
      !hasDynamicInputs(toManifest) &&
      !hasNoPorts(fromManifest) &&
      !hasNoPorts(toManifest)
    ) {
      const outPort = outputsOf(fromManifest).find((p) => p.id === fromPort);
      const inPort = inputsOf(toManifest).find((p) => p.id === toPort);
      if (outPort && inPort && !arePortTypesCompatible(outPort.type, inPort.type)) {
        issues.push({
          nodeId: toNode.id,
          nodeName: nameOf(toNode),
          level: "warning",
          message: `ポートの型が一致しません: 「${conn.from.port}」(${outPort.type}) → 「${conn.to.port}」(${inPort.type})`,
        });
      }
    }
  }

  return issues;
}
