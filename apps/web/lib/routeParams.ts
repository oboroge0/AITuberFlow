type RoutePrefix = "editor" | "preview" | "overlay";

function normalizeRawId(rawId: string | string[] | undefined): string | undefined {
  if (Array.isArray(rawId)) return rawId[0];
  return rawId;
}

/**
 * In static export mode, Next.js can hydrate dynamic routes with the generated
 * placeholder parameter ("_"). Recover the actual ID from location pathname.
 */
export function resolveWorkflowId(
  rawId: string | string[] | undefined,
  routePrefix: RoutePrefix,
): string {
  const normalizedId = normalizeRawId(rawId);
  if (normalizedId && normalizedId !== "_") {
    return normalizedId;
  }

  if (typeof window !== "undefined") {
    const prefix = `/${routePrefix}/`;
    if (window.location.pathname.startsWith(prefix)) {
      const segment = window.location.pathname.slice(prefix.length).split("/")[0];
      if (segment && segment !== "_") {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      }
    }
  }

  return normalizedId || "_";
}

