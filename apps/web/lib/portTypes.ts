export type PortType = 'string' | 'number' | 'boolean' | 'audio' | 'array' | 'object' | 'any' | 'trigger';

export const PORT_TYPE_COLORS: Record<PortType, string> = {
  string:  '#22C55E',  // green
  number:  '#3B82F6',  // blue
  boolean: '#A855F7',  // purple
  audio:   '#F59E0B',  // amber
  array:   '#EC4899',  // pink
  object:  '#6B7280',  // gray
  any:     '#94A3B8',  // slate (distinguishable from object)
  trigger: '#10B981',  // emerald
};

export const PORT_TYPE_LABELS: Record<PortType, string> = {
  string:  'テキスト',
  number:  '数値',
  boolean: '真偽値',
  audio:   '音声',
  array:   '配列',
  object:  'オブジェクト',
  any:     '任意',
  trigger: 'トリガー',
};

/** Port types that the UI models and can validate against each other. */
const KNOWN_PORT_TYPES: ReadonlySet<string> = new Set<PortType>([
  'string', 'number', 'boolean', 'audio', 'array', 'object', 'any', 'trigger',
]);

/**
 * Two types are compatible if either side is 'any', or they match exactly.
 *
 * Plugin-specific port types that the UI does not yet model (e.g. 'Message'
 * emitted by chat input nodes and consumed as 'string' by LLM prompts) are
 * treated as compatible — otherwise the type system would block valid
 * connections it simply doesn't describe yet (e.g. the core chat → LLM flow).
 */
export function arePortTypesCompatible(sourceType: PortType, targetType: PortType): boolean {
  if (sourceType === 'any' || targetType === 'any') return true;
  if (!KNOWN_PORT_TYPES.has(sourceType) || !KNOWN_PORT_TYPES.has(targetType)) return true;
  return sourceType === targetType;
}

export interface PortDefinition {
  id: string;
  label: string;
  type: PortType;
  description?: string;
}
