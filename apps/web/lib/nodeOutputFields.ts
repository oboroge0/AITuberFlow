/**
 * Known output fields for each node type.
 * Used as fallback when plugin store data is not yet available.
 * Shared between FieldSelectorNode and DataPreviewPopup.
 *
 * These IDs must match the port IDs in Canvas.tsx/getNodeOutputs.
 */
export const nodeOutputFields: Record<string, string[]> = {
  'twitch-chat': ['text', 'author', 'message'],
  'youtube-chat': ['text', 'author', 'message'],
  'manual-input': ['text'],
  'openai-llm': ['response'],
  'anthropic-llm': ['response'],
  'google-llm': ['response'],
  'ollama-llm': ['response'],
  'timer': ['tick', 'timestamp'],
  'http-request': ['response', 'status'],
  'text-transform': ['result'],
  'data-formatter': ['formatted', 'parsed'],
  'field-selector': ['output'],
  'template-editor': ['output'],
  'random': ['value'],
  'variable': ['value'],
  'switch': ['true', 'false'],
  'delay': ['output'],
  'loop': ['loop', 'done'],
  'foreach': ['item', 'index', 'done'],
};
