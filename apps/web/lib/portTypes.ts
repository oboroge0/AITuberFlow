export type PortType = 'string' | 'number' | 'boolean' | 'audio' | 'array' | 'object' | 'any';

export const PORT_TYPE_COLORS: Record<PortType, string> = {
  string: '#22C55E',   // green
  number: '#3B82F6',   // blue
  boolean: '#A855F7',  // purple
  audio: '#F59E0B',    // orange
  array: '#EC4899',    // pink
  object: '#6B7280',   // gray
  any: '#6B7280',      // gray
};

export interface PortDefinition {
  id: string;
  label: string;
  type: PortType;
}
