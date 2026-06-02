/**
 * Legacy port-ID aliases for the snake_case → camelCase config-naming refactor
 * (issue #104). Workflows saved before the rename still reference the old port
 * IDs in their connections, so old → new resolution lets those workflows keep
 * working without re-saving them.
 *
 * Shared by the executor (to route node inputs correctly) and the validator /
 * connection-integrity check (to avoid false "unconnected input" warnings and
 * to validate against the new camelCase ids) so the pieces cannot drift.
 */
export const LEGACY_PORT_ID_ALIASES: Record<string, string> = {
  mouth_values: "mouthValues",
  motion_url: "motionUrl",
  current_scene: "currentScene",
  scene_name: "sceneName",
  source_name: "sourceName",
};

export function resolvePortId(port: string): string {
  return LEGACY_PORT_ID_ALIASES[port] ?? port;
}
