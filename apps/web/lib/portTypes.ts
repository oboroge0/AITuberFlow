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

/** Two types are compatible if either side is 'any', or they match exactly. */
export function arePortTypesCompatible(sourceType: PortType, targetType: PortType): boolean {
  if (sourceType === 'any' || targetType === 'any') return true;
  return sourceType === targetType;
}

export interface PortDefinition {
  id: string;
  label: string;
  type: PortType;
  description?: string;
}
