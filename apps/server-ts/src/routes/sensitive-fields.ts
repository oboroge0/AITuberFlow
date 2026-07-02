/**
 * Shared helpers for detecting, masking, stripping, and restoring
 * sensitive configuration values (API keys, tokens, passwords, secrets)
 * across the settings and workflows routes.
 *
 * Centralizing this logic keeps GET-masking, export-stripping, and
 * PUT/start sentinel-restoration all in agreement about what counts as
 * "sensitive" and how deep to recurse into nested config objects.
 */

/** Placeholder returned instead of a real secret value in API responses. */
export const SENTINEL = "********";

/** Guards against pathological/deeply-nested config objects. */
const MAX_DEPTH = 20;

// Legacy exact-match key names, kept so the historical export-strip
// behavior stays documented explicitly. SENSITIVE_KEY_PATTERN below is a
// superset that also catches composite field names such as `llmApiKey`,
// `botToken`, `oauthToken`, `openai.apiKey`, `apiSecret`, etc.
const SENSITIVE_KEYS = ["apiKey", "api_key", "password", "secret", "token", "apiSecret"];
const SENSITIVE_KEYS_LOWER = new Set(SENSITIVE_KEYS.map((k) => k.toLowerCase()));

// `token$` is anchored to the end of the key so that `maxTokens` /
// `max_tokens` (a token *count*, not a credential) is correctly excluded,
// while `botToken`, `oauthToken`, `discord.token` etc. are still caught.
const SENSITIVE_KEY_PATTERN = /api[_-]?key|secret|password|credential|token$/i;

/**
 * Returns true if a config/settings key name should be treated as
 * sensitive (API key, token, password, secret, credential) and therefore
 * masked in GET responses, stripped on export, and eligible for
 * sentinel-skip/restore on write.
 *
 * Known sensitive keys actually used in this codebase (kept here as a
 * reference for tests): apiKey, api_key, apiSecret, llmApiKey,
 * botToken, oauthToken, password (obs-* nodes), and global settings keys
 * like openai.apiKey / anthropic.apiKey / google.apiKey / mistral.apiKey /
 * groq.apiKey. Explicitly NOT sensitive: model, host, maxTokens,
 * max_tokens, modelUrl, channelIds, etc.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS_LOWER.has(key.toLowerCase()) || SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * Recursively walk a value, applying `transform` to sensitive string
 * fields. Non-sensitive fields are recursed into; arrays are mapped;
 * primitives are returned unchanged. Input is not mutated.
 */
function transformSensitiveDeep(
  value: unknown,
  transform: (v: unknown) => unknown,
  depth: number,
): unknown {
  if (depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    return value.map((item) => transformSensitiveDeep(item, transform, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key)
        ? transform(inner)
        : transformSensitiveDeep(inner, transform, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Strip sensitive values down to "" (used for workflow export, which has
 * always discarded secrets rather than masking them).
 */
export function stripSensitiveDeep(value: unknown): unknown {
  return transformSensitiveDeep(value, (v) => (typeof v === "string" ? "" : v), 0);
}

/**
 * Mask sensitive values with SENTINEL for API responses. Empty strings are
 * left empty (not masked) so clients can distinguish "unset" from "set" —
 * e.g. the editor's "using global setting" fallback badge relies on being
 * able to see an empty string for an unset field.
 */
export function maskSensitiveDeep(value: unknown): unknown {
  return transformSensitiveDeep(
    value,
    (v) => (typeof v === "string" && v.length > 0 ? SENTINEL : v),
    0,
  );
}

/**
 * Recursively restore sentinel-masked sensitive fields in `next` with the
 * corresponding real value from `previous` (matched by identical key
 * path). If there is no corresponding previous value, the sentinel is left
 * as-is (saved literally — the user will need to re-enter the key).
 */
export function restoreSentinelDeep(next: unknown, previous: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return next;
  if (Array.isArray(next)) {
    const prevArr = Array.isArray(previous) ? previous : [];
    return next.map((item, i) => restoreSentinelDeep(item, prevArr[i], depth + 1));
  }
  if (next && typeof next === "object") {
    const prevObj =
      previous && typeof previous === "object" && !Array.isArray(previous)
        ? (previous as Record<string, unknown>)
        : {};
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(next as Record<string, unknown>)) {
      if (isSensitiveKey(key) && inner === SENTINEL && key in prevObj) {
        out[key] = prevObj[key];
      } else {
        out[key] = restoreSentinelDeep(inner, prevObj[key], depth + 1);
      }
    }
    return out;
  }
  return next;
}

/**
 * Restore sentinel-masked sensitive fields across a list of workflow
 * nodes, matching by node `id` against `previousNodes`. Nodes with no
 * matching id in `previousNodes` (new nodes, e.g. duplicated in the
 * editor) are returned unchanged — any sentinel value they carry will be
 * saved literally.
 */
export function restoreSentinelNodes(
  nextNodes: Record<string, unknown>[],
  previousNodes: Record<string, unknown>[],
): Record<string, unknown>[] {
  const previousById = new Map(
    previousNodes.filter((n) => typeof n.id === "string").map((n) => [n.id as string, n]),
  );
  return nextNodes.map((node) => {
    const prev = typeof node.id === "string" ? previousById.get(node.id) : undefined;
    if (!prev) return node;
    return restoreSentinelDeep(node, prev) as Record<string, unknown>;
  });
}
