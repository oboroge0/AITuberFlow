// Default assets for the application
export const DEFAULT_MODEL_URL = '/models/Flowchan.vrm';
export const DEFAULT_IDLE_ANIMATION = '/animations/idle.fbx';

// Shared LLM model options (used by NodeSettings, SettingsModal, etc.)
export const LLM_MODEL_OPTIONS: Record<string, { label: string; value: string }[]> = {
  openai: [
    { label: 'GPT-5.2', value: 'gpt-5.2' },
    { label: 'GPT-5.2 Codex', value: 'gpt-5.2-codex' },
    { label: 'GPT-5.1', value: 'gpt-5.1' },
    { label: 'GPT-5.1 Codex', value: 'gpt-5.1-codex' },
    { label: 'GPT-5.1 Codex Mini', value: 'gpt-5.1-codex-mini' },
    { label: 'GPT-5', value: 'gpt-5' },
    { label: 'GPT-5 Mini', value: 'gpt-5-mini' },
    { label: 'GPT-5 Nano', value: 'gpt-5-nano' },
    { label: 'GPT-4.1', value: 'gpt-4.1' },
    { label: 'GPT-4.1 Mini', value: 'gpt-4.1-mini' },
    { label: 'GPT-4.1 Nano', value: 'gpt-4.1-nano' },
    { label: 'o4 Mini', value: 'o4-mini' },
    { label: 'o3', value: 'o3' },
    { label: 'o3 Mini', value: 'o3-mini' },
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
  ],
  anthropic: [
    { label: 'Claude Opus 4', value: 'claude-opus-4-20250514' },
    { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
    { label: 'Claude 3.7 Sonnet', value: 'claude-3-7-sonnet-20250219' },
    { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
    { label: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
    { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
    { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' },
  ],
  google: [
    { label: 'Gemini 3 Pro Preview', value: 'gemini-3-pro-preview' },
    { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro-preview-05-06' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash-preview-05-20' },
  ],
  groq: [
    { label: 'Llama 3.3 70B Versatile', value: 'llama-3.3-70b-versatile' },
    { label: 'Llama 3.1 8B Instant', value: 'llama-3.1-8b-instant' },
    { label: 'Llama Guard 3 8B', value: 'llama-guard-3-8b' },
    { label: 'Mixtral 8x7B', value: 'mixtral-8x7b-32768' },
    { label: 'Gemma 2 9B', value: 'gemma2-9b-it' },
  ],
};
