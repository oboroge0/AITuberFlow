'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useTranslation } from '@/stores/localeStore';
import api, { VoicevoxSpeaker, AnimationInfo, ModelInfo } from '@/lib/api';

interface NodeField {
  key: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'animation-file' | 'model-file' | 'prompt-builder' | 'input-list' | 'expression-list' | 'password' | 'png-expression-map';
  label: string;
  placeholder?: string;
  options?: { label: string; value: string | number }[];
  dynamic?: boolean; // For dynamically loaded options
  accept?: string; // For file inputs
  showWhen?: { key: string; value: string | string[] }; // Conditional display
}

// Prompt section for structured prompt building
export interface PromptSection {
  id: string;
  type: 'text' | 'input';
  content: string; // For text: the actual text, For input: the input port name
}

// Separate component for input-list field to properly use hooks
interface InputListFieldProps {
  value: string[];
  onChange: (newValue: string[]) => void;
  placeholder?: string;
}

function InputListField({ value, onChange, placeholder }: InputListFieldProps) {
  const [newInput, setNewInput] = useState('');
  const inputs = value || [];

  const addInput = () => {
    const trimmed = newInput.trim().replace(/\s/g, '_');
    if (trimmed && !inputs.includes(trimmed)) {
      onChange([...inputs, trimmed]);
      setNewInput('');
    }
  };

  const removeInput = (index: number) => {
    onChange(inputs.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {/* Existing inputs */}
      <div className="flex flex-wrap gap-1">
        {inputs.map((input, index) => (
          <div
            key={index}
            className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/20 border border-blue-500/30 text-[11px] text-blue-300"
          >
            <span>{`{{${input}}}`}</span>
            <button
              onClick={() => removeInput(index)}
              className="text-red-400 hover:text-red-300 ml-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Add new input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newInput}
          onChange={(e) => setNewInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addInput()}
          placeholder={placeholder || 'input_name'}
          style={{
            flex: 1,
            padding: '6px 8px',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(0,0,0,0.3)',
            color: '#fff',
            fontSize: '11px',
            outline: 'none',
          }}
        />
        <button
          onClick={addInput}
          className="px-3 py-1 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-400 text-[11px] cursor-pointer hover:bg-blue-500/20"
        >
          Add
        </button>
      </div>

      {/* Help text */}
      <div className="text-[9px] text-white/40">
        Add input names to create ports. Use {`{{name}}`} in template.
      </div>
    </div>
  );
}

// Expression type for emotion analyzer
export interface Expression {
  id: string;
  label: string;
  description: string;
  keywords_ja?: string[];
  keywords_en?: string[];
}

// Default expressions for emotion analyzer
const DEFAULT_EXPRESSIONS: Expression[] = [
  { id: 'neutral', label: 'Neutral', description: 'Default calm state, no strong emotion', keywords_ja: [], keywords_en: [] },
  { id: 'happy', label: 'Happy', description: 'Joy, excitement, gratitude, amusement, laughter', keywords_ja: ['嬉しい', '楽しい', '笑', 'www', '草'], keywords_en: ['happy', 'joy', 'lol', 'haha', 'yay'] },
  { id: 'sad', label: 'Sad', description: 'Sadness, disappointment, loneliness, regret', keywords_ja: ['悲しい', '辛い', '泣'], keywords_en: ['sad', 'sorry', 'cry'] },
  { id: 'angry', label: 'Angry', description: 'Anger, frustration, irritation, annoyance', keywords_ja: ['怒', 'むかつく', 'イライラ'], keywords_en: ['angry', 'mad', 'hate'] },
  { id: 'surprised', label: 'Surprised', description: 'Surprise, shock, amazement, disbelief', keywords_ja: ['驚', 'びっくり', 'すごい', 'やばい'], keywords_en: ['wow', 'omg', 'surprised'] },
  { id: 'relaxed', label: 'Relaxed', description: 'Calm, peaceful, comfortable, relieved', keywords_ja: ['落ち着', 'リラックス', '癒し'], keywords_en: ['calm', 'relax', 'chill'] },
];

// Separate component for expression-list field
interface ExpressionListFieldProps {
  value: Expression[];
  onChange: (newValue: Expression[]) => void;
}

function ExpressionListField({ value, onChange }: ExpressionListFieldProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newExpr, setNewExpr] = useState<Partial<Expression>>({ id: '', label: '', description: '' });
  const expressions = value || [];

  const loadDefaults = () => {
    onChange(DEFAULT_EXPRESSIONS);
  };

  const addExpression = () => {
    const trimmedId = newExpr.id?.trim().toLowerCase().replace(/\s+/g, '-') || '';
    const trimmedLabel = newExpr.label?.trim() || '';
    const trimmedDesc = newExpr.description?.trim() || '';

    if (!trimmedId || !trimmedLabel) return;
    if (expressions.some(e => e.id === trimmedId)) return;

    const newExpression: Expression = {
      id: trimmedId,
      label: trimmedLabel,
      description: trimmedDesc,
      keywords_ja: [],
      keywords_en: [],
    };

    onChange([...expressions, newExpression]);
    setNewExpr({ id: '', label: '', description: '' });
  };

  const removeExpression = (id: string) => {
    onChange(expressions.filter(e => e.id !== id));
  };

  const updateExpression = (id: string, updates: Partial<Expression>) => {
    onChange(expressions.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const inputStyle = {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(0,0,0,0.3)',
    color: '#fff',
    fontSize: '11px',
    outline: 'none',
  };

  return (
    <div className="space-y-2">
      {/* Load defaults button when empty */}
      {expressions.length === 0 && (
        <button
          onClick={loadDefaults}
          className="w-full py-2 rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[11px] cursor-pointer transition-colors hover:bg-emerald-500/20"
        >
          Load Default Expressions (6)
        </button>
      )}

      {/* Existing expressions */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {expressions.map((expr) => (
          <div
            key={expr.id}
            className="p-2 rounded-md border border-white/10 bg-black/20"
          >
            {editingId === expr.id ? (
              // Edit mode
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={expr.label}
                    onChange={(e) => updateExpression(expr.id, { label: e.target.value })}
                    placeholder="Label"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-2 py-1 rounded text-[10px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                  >
                    Done
                  </button>
                </div>
                <textarea
                  value={expr.description}
                  onChange={(e) => updateExpression(expr.id, { description: e.target.value })}
                  placeholder="Description for LLM (e.g., 'Self-satisfied, proud, confident')"
                  rows={2}
                  style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
                />
                <div className="text-[9px] text-white/40">
                  ID: {expr.id} (cannot be changed)
                </div>
              </div>
            ) : (
              // View mode
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white font-medium">{expr.label}</div>
                  <div className="text-[10px] text-white/50">ID: {expr.id}</div>
                  <div className="text-[10px] text-white/40 truncate">{expr.description}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setEditingId(expr.id)}
                    className="px-2 py-1 rounded text-[10px] bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeExpression(expr.id)}
                    className="px-2 py-1 rounded text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new expression */}
      <div className="border-t border-white/10 pt-2 mt-2">
        <div className="text-[10px] text-white/50 mb-2">Add New Expression</div>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newExpr.id || ''}
            onChange={(e) => setNewExpr({ ...newExpr, id: e.target.value })}
            placeholder="ID (e.g., smug)"
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="text"
            value={newExpr.label || ''}
            onChange={(e) => setNewExpr({ ...newExpr, label: e.target.value })}
            placeholder="Label"
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newExpr.description || ''}
            onChange={(e) => setNewExpr({ ...newExpr, description: e.target.value })}
            placeholder="Description for LLM analysis"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={addExpression}
            disabled={!newExpr.id?.trim() || !newExpr.label?.trim()}
            className="px-3 py-1 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-400 text-[11px] cursor-pointer hover:bg-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>

      {/* Info text */}
      <div className="text-[9px] text-white/40 pt-1">
        Expressions define emotions the LLM can detect. The ID must match your avatar&apos;s expression/image names.
      </div>
    </div>
  );
}

// PNG Expression mapping type
interface PngExpressionMapping {
  id: string;
  filename: string;
}

interface PngConfig {
  baseUrl: string;
  expressions: Record<string, string>;
}

// Separate component for PNG expression map field
interface PngExpressionMapFieldProps {
  value: PngConfig;
  onChange: (newValue: PngConfig) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  availableImages: string[];
}

function PngExpressionMapField({ value, onChange, onUploadImage, availableImages }: PngExpressionMapFieldProps) {
  const [newMapping, setNewMapping] = useState<PngExpressionMapping>({ id: '', filename: '' });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config: PngConfig = value || { baseUrl: '/images/avatar/', expressions: {} };
  const mappings = Object.entries(config.expressions || {}).map(([id, filename]) => ({ id, filename }));

  const updateBaseUrl = (baseUrl: string) => {
    onChange({ ...config, baseUrl });
  };

  const addMapping = () => {
    const trimmedId = newMapping.id.trim().toLowerCase().replace(/\s+/g, '-');
    const trimmedFilename = newMapping.filename.trim();

    if (!trimmedId || !trimmedFilename) return;
    if (config.expressions[trimmedId]) return;

    onChange({
      ...config,
      expressions: { ...config.expressions, [trimmedId]: trimmedFilename }
    });
    setNewMapping({ id: '', filename: '' });
  };

  const removeMapping = (id: string) => {
    const newExpressions = { ...config.expressions };
    delete newExpressions[id];
    onChange({ ...config, expressions: newExpressions });
  };

  const updateMapping = (oldId: string, newId: string, filename: string) => {
    const newExpressions = { ...config.expressions };
    if (oldId !== newId) {
      delete newExpressions[oldId];
    }
    newExpressions[newId] = filename;
    onChange({ ...config, expressions: newExpressions });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const url = await onUploadImage(file);
      if (url) {
        const filename = url.split('/').pop() || file.name;
        setNewMapping({ ...newMapping, filename });
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const loadDefaultMappings = () => {
    onChange({
      ...config,
      expressions: {
        neutral: 'neutral.png',
        happy: 'happy.png',
        sad: 'sad.png',
        angry: 'angry.png',
        surprised: 'surprised.png',
        relaxed: 'relaxed.png',
      }
    });
  };

  const inputStyle = {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(0,0,0,0.3)',
    color: '#fff',
    fontSize: '11px',
    outline: 'none',
  };

  return (
    <div className="space-y-3">
      {/* Base URL */}
      <div>
        <label className="block text-[10px] text-white/50 mb-1">Base URL (画像フォルダ)</label>
        <input
          type="text"
          value={config.baseUrl}
          onChange={(e) => updateBaseUrl(e.target.value)}
          placeholder="/images/avatar/"
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>

      {/* Load defaults button when empty */}
      {mappings.length === 0 && (
        <button
          onClick={loadDefaultMappings}
          className="w-full py-2 rounded-md border border-purple-500/50 bg-purple-500/10 text-purple-400 text-[11px] cursor-pointer transition-colors hover:bg-purple-500/20"
        >
          Load Default Mappings (6)
        </button>
      )}

      {/* Expression mappings */}
      <div className="space-y-2 max-h-[250px] overflow-y-auto">
        {mappings.map(({ id, filename }) => (
          <div
            key={id}
            className="flex items-center gap-2 p-2 rounded-md border border-white/10 bg-black/20"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-purple-400 font-mono">{id}</span>
                <span className="text-white/30">→</span>
                <span className="text-xs text-white/70 truncate">{filename}</span>
              </div>
            </div>
            <button
              onClick={() => removeMapping(id)}
              className="px-2 py-1 rounded text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30 shrink-0"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Add new mapping */}
      <div className="border-t border-white/10 pt-3">
        <div className="text-[10px] text-white/50 mb-2">Add Expression Mapping</div>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newMapping.id}
            onChange={(e) => setNewMapping({ ...newMapping, id: e.target.value })}
            placeholder="Expression ID (e.g., smug)"
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newMapping.filename}
            onChange={(e) => setNewMapping({ ...newMapping, filename: e.target.value })}
            placeholder="Image filename (e.g., smug.png)"
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-2 py-1 rounded-md border border-purple-500/50 bg-purple-500/10 text-purple-400 text-[10px] cursor-pointer hover:bg-purple-500/20 disabled:opacity-50 shrink-0"
          >
            {uploading ? '...' : 'Upload'}
          </button>
        </div>
        <button
          onClick={addMapping}
          disabled={!newMapping.id.trim() || !newMapping.filename.trim()}
          className="w-full py-2 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-400 text-[11px] cursor-pointer hover:bg-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          + Add Mapping
        </button>
      </div>

      {/* Preview info */}
      <div className="text-[9px] text-white/40 pt-1">
        Map expression IDs to image files. Full path: {config.baseUrl}[filename]
      </div>
    </div>
  );
}

// Simplified node config schemas
const nodeConfigs: Record<string, { label: string; fields: NodeField[] }> = {
  'start': {
    label: 'Start',
    fields: [
      { key: 'autoStart', type: 'checkbox', label: 'Auto Start', placeholder: 'Start automatically when workflow runs' },
    ],
  },
  'end': {
    label: 'End',
    fields: [
      { key: 'message', type: 'text', label: 'Completion Message', placeholder: 'Workflow completed' },
    ],
  },
  'loop': {
    label: 'Loop',
    fields: [
      {
        key: 'mode',
        type: 'select',
        label: 'Loop Mode',
        options: [
          { label: 'Count', value: 'count' },
          { label: 'While Condition', value: 'while' },
          { label: 'Infinite', value: 'infinite' },
        ],
      },
      { key: 'count', type: 'number', label: 'Loop Count', placeholder: '3' },
      { key: 'condition', type: 'text', label: 'Condition (for While)', placeholder: '{{value}} > 0' },
      { key: 'maxIterations', type: 'number', label: 'Max Iterations (safety)', placeholder: '100' },
    ],
  },
  'foreach': {
    label: 'ForEach',
    fields: [
      { key: 'separator', type: 'text', label: 'Separator', placeholder: '\\n (newline) or , (comma)' },
    ],
  },
  'youtube-chat': {
    label: 'YouTube Chat',
    fields: [
      { key: 'videoId', type: 'text', label: 'Video ID', placeholder: 'dQw4w9WgXcQ' },
      { key: 'apiKey', type: 'text', label: 'API Key', placeholder: 'Your YouTube API key' },
    ],
  },
  'twitch-chat': {
    label: 'Twitch Chat',
    fields: [
      { key: 'channel', type: 'text', label: 'Channel', placeholder: 'Channel name' },
    ],
  },
  'openai-llm': {
    label: 'ChatGPT (OpenAI)',
    fields: [
      { key: 'apiKey', type: 'password', label: 'API Key', placeholder: 'sk-...' },
      {
        key: 'model',
        type: 'select',
        label: 'Model',
        options: [
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
      },
      { key: 'systemPrompt', type: 'textarea', label: 'System Prompt', placeholder: 'Enter character settings...' },
      { key: 'promptSections', type: 'prompt-builder', label: 'Prompt Builder' },
      { key: 'temperature', type: 'number', label: 'Temperature', placeholder: '0.7' },
    ],
  },
  'anthropic-llm': {
    label: 'Claude (Anthropic)',
    fields: [
      { key: 'apiKey', type: 'password', label: 'API Key', placeholder: 'sk-ant-...' },
      {
        key: 'model',
        type: 'select',
        label: 'Model',
        options: [
          { label: 'Claude Opus 4', value: 'claude-opus-4-20250514' },
          { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
          { label: 'Claude 3.7 Sonnet', value: 'claude-3-7-sonnet-20250219' },
          { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
          { label: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
          { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
          { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' },
        ],
      },
      { key: 'systemPrompt', type: 'textarea', label: 'System Prompt', placeholder: 'Enter character settings...' },
      { key: 'maxTokens', type: 'number', label: 'Max Tokens', placeholder: '1024' },
      { key: 'temperature', type: 'number', label: 'Temperature', placeholder: '0.7' },
    ],
  },
  'google-llm': {
    label: 'Gemini (Google)',
    fields: [
      { key: 'apiKey', type: 'password', label: 'API Key', placeholder: 'AI...' },
      {
        key: 'model',
        type: 'select',
        label: 'Model',
        options: [
          { label: 'Gemini 3 Pro Preview', value: 'gemini-3-pro-preview' },
          { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
          { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro-preview-05-06' },
          { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash-preview-05-20' },
          { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
          { label: 'Gemini 2.0 Flash Lite', value: 'gemini-2.0-flash-lite' },
          { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
          { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
        ],
      },
      { key: 'systemPrompt', type: 'textarea', label: 'System Prompt', placeholder: 'Enter character settings...' },
      { key: 'maxTokens', type: 'number', label: 'Max Tokens', placeholder: '1024' },
      { key: 'temperature', type: 'number', label: 'Temperature', placeholder: '0.7' },
    ],
  },
  'ollama-llm': {
    label: 'LLM (Ollama)',
    fields: [
      { key: 'host', type: 'text', label: 'Ollama Host', placeholder: 'http://localhost:11434' },
      { key: 'model', type: 'text', label: 'Model', placeholder: 'llama3.2, mistral, gemma2...' },
      { key: 'systemPrompt', type: 'textarea', label: 'System Prompt', placeholder: 'Enter character settings...' },
      { key: 'temperature', type: 'number', label: 'Temperature', placeholder: '0.7' },
      { key: 'contextLength', type: 'number', label: 'Context Length', placeholder: '4096' },
    ],
  },
  'voicevox-tts': {
    label: 'TTS (VOICEVOX)',
    fields: [
      { key: 'host', type: 'text', label: 'VOICEVOX Host', placeholder: 'http://localhost:50021' },
      {
        key: 'speaker',
        type: 'select',
        label: 'Speaker',
        dynamic: true,
        options: [],
      },
      { key: 'speedScale', type: 'number', label: 'Speed', placeholder: '1.0' },
      { key: 'demoMode', type: 'checkbox', label: 'Demo Mode' },
    ],
  },
  'coeiroink-tts': {
    label: 'TTS (COEIROINK)',
    fields: [
      { key: 'host', type: 'text', label: 'COEIROINK Host', placeholder: 'http://localhost:50032' },
      { key: 'speakerUuid', type: 'text', label: 'Speaker UUID', placeholder: 'Get from COEIROINK' },
      { key: 'styleId', type: 'number', label: 'Style ID', placeholder: '0' },
      { key: 'speedScale', type: 'number', label: 'Speed', placeholder: '1.0' },
      { key: 'pitchScale', type: 'number', label: 'Pitch', placeholder: '1.0' },
      { key: 'demoMode', type: 'checkbox', label: 'Demo Mode' },
    ],
  },
  'sbv2-tts': {
    label: 'TTS (Style-Bert-VITS2)',
    fields: [
      { key: 'host', type: 'text', label: 'SBV2 Host', placeholder: 'http://localhost:5000' },
      { key: 'modelName', type: 'text', label: 'Model Name', placeholder: 'Model name' },
      { key: 'speakerId', type: 'number', label: 'Speaker ID', placeholder: '0' },
      { key: 'style', type: 'text', label: 'Style', placeholder: 'Neutral, Happy, Sad...' },
      { key: 'styleWeight', type: 'number', label: 'Style Weight', placeholder: '1.0' },
      { key: 'length', type: 'number', label: 'Speed', placeholder: '1.0' },
      { key: 'demoMode', type: 'checkbox', label: 'Demo Mode' },
    ],
  },
  'manual-input': {
    label: 'Manual Input',
    fields: [
      { key: 'inputText', type: 'textarea', label: 'Text', placeholder: 'Enter text to send...' },
    ],
  },
  'console-output': {
    label: 'Console Output',
    fields: [
      { key: 'prefix', type: 'text', label: 'Prefix', placeholder: '[Output]' },
    ],
  },
  'switch': {
    label: 'Switch',
    fields: [
      {
        key: 'mode',
        type: 'select',
        label: 'Mode',
        options: [
          { label: 'Truthy/Falsy', value: 'truthy' },
          { label: 'Equals', value: 'equals' },
          { label: 'Contains', value: 'contains' },
        ],
      },
      { key: 'compareValue', type: 'text', label: 'Compare Value', placeholder: 'Value to compare' },
    ],
  },
  'delay': {
    label: 'Delay',
    fields: [
      { key: 'delayMs', type: 'number', label: 'Delay (ms)', placeholder: '1000' },
      { key: 'randomize', type: 'checkbox', label: 'Randomize' },
      { key: 'randomMin', type: 'number', label: 'Random Min (ms)', placeholder: '500' },
      { key: 'randomMax', type: 'number', label: 'Random Max (ms)', placeholder: '2000' },
    ],
  },
  'http-request': {
    label: 'HTTP Request',
    fields: [
      { key: 'url', type: 'text', label: 'URL', placeholder: 'https://api.example.com/...' },
      {
        key: 'method',
        type: 'select',
        label: 'Method',
        options: [
          { label: 'GET', value: 'GET' },
          { label: 'POST', value: 'POST' },
          { label: 'PUT', value: 'PUT' },
          { label: 'DELETE', value: 'DELETE' },
          { label: 'PATCH', value: 'PATCH' },
        ],
      },
      { key: 'headers', type: 'textarea', label: 'Headers (JSON)', placeholder: '{"Authorization": "Bearer ..."}' },
      { key: 'timeout', type: 'number', label: 'Timeout (ms)', placeholder: '30000' },
    ],
  },
  'text-transform': {
    label: 'Text Transform',
    fields: [
      {
        key: 'operation',
        type: 'select',
        label: 'Operation',
        options: [
          { label: 'Template', value: 'template' },
          { label: 'Uppercase', value: 'uppercase' },
          { label: 'Lowercase', value: 'lowercase' },
          { label: 'Trim', value: 'trim' },
          { label: 'Replace', value: 'replace' },
          { label: 'Prefix', value: 'prefix' },
          { label: 'Suffix', value: 'suffix' },
          { label: 'Split First', value: 'split_first' },
          { label: 'Split Last', value: 'split_last' },
          { label: 'Length', value: 'length' },
        ],
      },
      { key: 'template', type: 'textarea', label: 'Template', placeholder: '{{author}}さん: {{message}}' },
      { key: 'templateInputs', type: 'input-list', label: 'Template Inputs', placeholder: 'author, message...' },
      { key: 'find', type: 'text', label: 'Find (for Replace)', placeholder: 'Text to find' },
      { key: 'replaceWith', type: 'text', label: 'Replace With', placeholder: 'Replacement text' },
      { key: 'delimiter', type: 'text', label: 'Delimiter (for Split)', placeholder: ' ' },
    ],
  },
  'random': {
    label: 'Random',
    fields: [
      {
        key: 'mode',
        type: 'select',
        label: 'Mode',
        options: [
          { label: 'Number', value: 'number' },
          { label: 'Choice', value: 'choice' },
          { label: 'Boolean', value: 'boolean' },
        ],
      },
      { key: 'min', type: 'number', label: 'Min (for Number)', placeholder: '0' },
      { key: 'max', type: 'number', label: 'Max (for Number)', placeholder: '100' },
      { key: 'choices', type: 'text', label: 'Choices (comma separated)', placeholder: 'option1, option2, option3' },
      { key: 'trueProbability', type: 'number', label: 'True Probability % (for Boolean)', placeholder: '50' },
    ],
  },
  'timer': {
    label: 'Timer',
    fields: [
      { key: 'intervalMs', type: 'number', label: 'Interval (ms)', placeholder: '5000' },
      { key: 'maxTicks', type: 'number', label: 'Max Ticks (0=unlimited)', placeholder: '0' },
      { key: 'immediate', type: 'checkbox', label: 'Fire Immediately' },
    ],
  },
  'variable': {
    label: 'Variable',
    fields: [
      { key: 'name', type: 'text', label: 'Variable Name', placeholder: 'myVariable' },
      { key: 'defaultValue', type: 'text', label: 'Default Value', placeholder: 'Default value' },
      {
        key: 'valueType',
        type: 'select',
        label: 'Value Type',
        options: [
          { label: 'String', value: 'string' },
          { label: 'Number', value: 'number' },
          { label: 'Boolean', value: 'boolean' },
          { label: 'JSON', value: 'json' },
        ],
      },
    ],
  },
  // Avatar nodes
  'avatar-configuration': {
    label: 'Avatar Configuration',
    fields: [
      {
        key: 'renderer',
        type: 'select',
        label: 'Renderer',
        options: [
          { label: 'VRM (Built-in)', value: 'vrm' },
          { label: 'VTube Studio', value: 'vtube-studio' },
          { label: 'PNG Images', value: 'png' },
        ],
      },
      // VRM settings
      { key: 'model_url', type: 'model-file', label: 'VRM Model', placeholder: 'Upload VRM model...', accept: '.vrm', showWhen: { key: 'renderer', value: 'vrm' } },
      { key: 'idle_animation', type: 'animation-file', label: 'Idle Animation (FBX)', placeholder: 'Upload Mixamo FBX...', accept: '.fbx', showWhen: { key: 'renderer', value: 'vrm' } },
      // VTube Studio settings
      { key: 'vtube_port', type: 'number', label: 'VTube Studio Port', placeholder: '8001', showWhen: { key: 'renderer', value: 'vtube-studio' } },
      // PNG settings
      { key: 'png_config', type: 'png-expression-map', label: 'PNG Expression Mappings', showWhen: { key: 'renderer', value: 'png' } },
    ],
  },
  'motion-trigger': {
    label: 'Motion Trigger',
    fields: [
      { key: 'expression', type: 'text', label: 'Expression ID', placeholder: 'happy, sad, smug, etc.' },
      { key: 'intensity', type: 'number', label: 'Expression Intensity (0.0-1.0)', placeholder: '0.8' },
      { key: 'motion_url', type: 'animation-file', label: 'Motion Animation (FBX)', placeholder: 'Upload Mixamo FBX...', accept: '.fbx' },
      { key: 'emit_events', type: 'checkbox', label: 'Emit Avatar Events' },
    ],
  },
  'emotion-analyzer': {
    label: 'Emotion Analyzer',
    fields: [
      {
        key: 'method',
        type: 'select',
        label: 'Analysis Method',
        options: [
          { label: 'LLM-based (Recommended)', value: 'llm' },
          { label: 'Rule-based (Keywords)', value: 'rule-based' },
        ],
      },
      { key: 'expressions', type: 'expression-list', label: 'Available Expressions' },
      {
        key: 'llm_provider',
        type: 'select',
        label: 'LLM Provider',
        options: [
          { label: 'OpenAI', value: 'openai' },
          { label: 'Anthropic', value: 'anthropic' },
          { label: 'Google', value: 'google' },
        ],
        showWhen: { key: 'method', value: 'llm' },
      },
      { key: 'llm_api_key', type: 'password', label: 'LLM API Key', placeholder: 'sk-...', showWhen: { key: 'method', value: 'llm' } },
      { key: 'llm_model', type: 'text', label: 'LLM Model', placeholder: 'gpt-4o-mini', showWhen: { key: 'method', value: 'llm' } },
      {
        key: 'language',
        type: 'select',
        label: 'Language',
        options: [
          { label: 'Japanese', value: 'ja' },
          { label: 'English', value: 'en' },
          { label: 'Auto-detect', value: 'auto' },
        ],
        showWhen: { key: 'method', value: 'rule-based' },
      },
      { key: 'custom_mappings', type: 'textarea', label: 'Custom Keyword Mappings (JSON)', placeholder: '{"happy": ["keyword1", "keyword2"]}', showWhen: { key: 'method', value: 'rule-based' } },
      { key: 'emit_events', type: 'checkbox', label: 'Emit Avatar Events' },
    ],
  },
  'lip-sync': {
    label: 'Lip Sync',
    fields: [
      {
        key: 'method',
        type: 'select',
        label: 'Lip Sync Method',
        options: [
          { label: 'Volume-based (Simple)', value: 'volume' },
          { label: 'Envelope Following', value: 'envelope' },
        ],
      },
      { key: 'sensitivity', type: 'number', label: 'Sensitivity (1.0-10.0)', placeholder: '5.0' },
      { key: 'smoothing', type: 'number', label: 'Smoothing (0.0-0.9)', placeholder: '0.3' },
      { key: 'threshold', type: 'number', label: 'Threshold (0.0-0.2)', placeholder: '0.02' },
      { key: 'emit_realtime', type: 'checkbox', label: 'Emit Realtime Events' },
      { key: 'frame_rate', type: 'number', label: 'Frame Rate', placeholder: '30' },
    ],
  },
  'avatar-display': {
    label: 'Avatar Display',
    fields: [
      {
        key: 'renderer',
        type: 'select',
        label: 'Renderer',
        options: [
          { label: 'VRM (Built-in)', value: 'vrm' },
          { label: 'VTube Studio', value: 'vtube-studio' },
          { label: 'PNG Images', value: 'png' },
        ],
      },
      { key: 'model_url', type: 'model-file', label: 'VRM Model', placeholder: 'Upload VRM model...', accept: '.vrm', showWhen: { key: 'renderer', value: 'vrm' } },
      { key: 'animation_url', type: 'animation-file', label: 'Idle Animation (FBX)', placeholder: 'Upload Mixamo FBX...', accept: '.fbx', showWhen: { key: 'renderer', value: 'vrm' } },
      { key: 'vtube_port', type: 'number', label: 'VTube Studio Port', placeholder: '8001', showWhen: { key: 'renderer', value: 'vtube-studio' } },
      { key: 'png_config', type: 'png-expression-map', label: 'PNG Expression Mappings', showWhen: { key: 'renderer', value: 'png' } },
      { key: 'auto_emotion', type: 'checkbox', label: 'Auto Emotion Detection' },
      { key: 'auto_lipsync', type: 'checkbox', label: 'Auto Lip Sync' },
      { key: 'show_subtitle', type: 'checkbox', label: 'Show Subtitle' },
      { key: 'lipsync_sensitivity', type: 'number', label: 'Lip Sync Sensitivity (1.0-10.0)', placeholder: '5.0' },
      { key: 'lipsync_smoothing', type: 'number', label: 'Lip Sync Smoothing (0.0-0.9)', placeholder: '0.3' },
      { key: 'lipsync_threshold', type: 'number', label: 'Lip Sync Threshold (0.0-0.2)', placeholder: '0.02' },
      {
        key: 'emotion_language',
        type: 'select',
        label: 'Emotion Detection Language',
        options: [
          { label: 'Japanese', value: 'ja' },
          { label: 'English', value: 'en' },
          { label: 'Auto-detect', value: 'auto' },
        ],
      },
    ],
  },
};

export default function NodeSettings() {
  const { selectedNodeId, nodes, updateNode, removeNode } = useWorkflowStore();
  const { t } = useTranslation();
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  const [voicevoxSpeakers, setVoicevoxSpeakers] = useState<VoicevoxSpeaker[]>([]);
  const [voicevoxLoading, setVoicevoxLoading] = useState(false);
  const [voicevoxError, setVoicevoxError] = useState<string | null>(null);
  const [animations, setAnimations] = useState<AnimationInfo[]>([]);
  const [animationUploading, setAnimationUploading] = useState(false);
  const animationInputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelUploading, setModelUploading] = useState(false);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const [avatarImages, setAvatarImages] = useState<string[]>([]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Fetch animations list
  const fetchAnimations = useCallback(async () => {
    try {
      const response = await api.listAnimations();
      if (response.data) {
        setAnimations(response.data.animations);
      }
    } catch (err) {
      console.error('Failed to fetch animations:', err);
    }
  }, []);

  // Fetch models list
  const fetchModels = useCallback(async () => {
    try {
      const response = await api.listModels();
      if (response.data) {
        setModels(response.data.models);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  }, []);

  // Handle animation file upload
  const handleAnimationUpload = useCallback(async (file: File, fieldKey: string) => {
    setAnimationUploading(true);
    try {
      const response = await api.uploadAnimation(file);
      if (response.data) {
        // Update the config with the new animation URL
        const newConfig = { ...localConfig, [fieldKey]: response.data.url };
        setLocalConfig(newConfig);
        if (selectedNode) {
          updateNode(selectedNode.id, { config: newConfig });
        }
        // Refresh the animations list
        fetchAnimations();
      } else if (response.error) {
        alert(`Upload failed: ${response.error}`);
      }
    } catch (err) {
      alert('Failed to upload animation file');
    } finally {
      setAnimationUploading(false);
    }
  }, [localConfig, selectedNode, updateNode, fetchAnimations]);

  // Handle model file upload
  const handleModelUpload = useCallback(async (file: File, fieldKey: string) => {
    setModelUploading(true);
    try {
      const response = await api.uploadModel(file);
      if (response.data) {
        // Update the config with the new model URL
        const newConfig = { ...localConfig, [fieldKey]: response.data.url };
        setLocalConfig(newConfig);
        if (selectedNode) {
          updateNode(selectedNode.id, { config: newConfig });
        }
        // Refresh the models list
        fetchModels();
      } else if (response.error) {
        alert(`Upload failed: ${response.error}`);
      }
    } catch (err) {
      alert('Failed to upload model file');
    } finally {
      setModelUploading(false);
    }
  }, [localConfig, selectedNode, updateNode, fetchModels]);

  // Handle avatar image upload (for PNG mode)
  const handleAvatarImageUpload = useCallback(async (file: File): Promise<string | null> => {
    try {
      const response = await api.uploadModel(file); // Reuse model upload endpoint for images
      if (response.data) {
        return response.data.url;
      } else if (response.error) {
        alert(`Upload failed: ${response.error}`);
      }
    } catch (err) {
      alert('Failed to upload image');
    }
    return null;
  }, []);

  // Fetch VOICEVOX speakers when node is selected or host changes
  const fetchVoicevoxSpeakers = useCallback(async (host: string) => {
    setVoicevoxLoading(true);
    setVoicevoxError(null);
    try {
      const response = await api.getVoicevoxSpeakers(host);
      if (response.data) {
        setVoicevoxSpeakers(response.data.speakers);
      } else if (response.error) {
        setVoicevoxError(response.error);
        setVoicevoxSpeakers([]);
      }
    } catch (err) {
      setVoicevoxError('Failed to fetch speakers');
      setVoicevoxSpeakers([]);
    } finally {
      setVoicevoxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedNode) {
      setLocalConfig(selectedNode.config || {});

      // Fetch VOICEVOX speakers if this is a voicevox-tts node
      if (selectedNode.type === 'voicevox-tts') {
        const host = (selectedNode.config?.host as string) || 'http://localhost:50021';
        fetchVoicevoxSpeakers(host);
      }

      // Fetch animations if this is an avatar-related node with animation field
      if (selectedNode.type === 'avatar-display' || selectedNode.type === 'avatar-configuration' || selectedNode.type === 'motion-trigger') {
        fetchAnimations();
      }

      // Fetch models if this is an avatar-configuration node
      if (selectedNode.type === 'avatar-configuration') {
        fetchModels();
      }
    }
  }, [selectedNode, fetchVoicevoxSpeakers, fetchAnimations, fetchModels]);

  if (!selectedNode) {
    return null;
  }

  const schema = nodeConfigs[selectedNode.type];

  const handleChange = (key: string, value: unknown) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    updateNode(selectedNode.id, { config: newConfig });

    // Refetch speakers when host changes for voicevox-tts
    if (selectedNode.type === 'voicevox-tts' && key === 'host') {
      fetchVoicevoxSpeakers(value as string);
    }
  };

  const handleDelete = () => {
    if (confirm('Delete this node?')) {
      removeNode(selectedNode.id);
    }
  };

  const renderField = (field: NodeField) => {
    const value = localConfig[field.key] ?? '';

    const inputStyle = {
      width: '100%',
      padding: '8px',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.2)',
      background: 'rgba(0,0,0,0.3)',
      color: '#fff',
      fontSize: '12px',
      outline: 'none',
    };

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            value={value as string}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            style={inputStyle}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={value as number}
            onChange={(e) => handleChange(field.key, parseFloat(e.target.value))}
            placeholder={field.placeholder}
            style={inputStyle}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value as string}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
          />
        );

      case 'select':
        // Handle dynamic VOICEVOX speaker options
        if (field.dynamic && field.key === 'speaker' && selectedNode.type === 'voicevox-tts') {
          if (voicevoxLoading) {
            return (
              <div style={{ ...inputStyle, color: 'rgba(255,255,255,0.5)' }}>
                Loading speakers...
              </div>
            );
          }
          if (voicevoxError) {
            return (
              <div>
                <div style={{ ...inputStyle, color: '#f87171', marginBottom: '4px' }}>
                  {voicevoxError}
                </div>
                <button
                  onClick={() => fetchVoicevoxSpeakers((localConfig.host as string) || 'http://localhost:50021')}
                  style={{
                    ...inputStyle,
                    cursor: 'pointer',
                    textAlign: 'center',
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: '1px solid rgba(16, 185, 129, 0.5)',
                  }}
                >
                  Retry
                </button>
              </div>
            );
          }
          return (
            <select
              value={value as string}
              onChange={(e) => handleChange(field.key, parseInt(e.target.value, 10))}
              style={inputStyle}
            >
              <option value="">Select a speaker...</option>
              {voicevoxSpeakers.map((speaker) => (
                <option key={speaker.id} value={speaker.id}>
                  {speaker.label}
                </option>
              ))}
            </select>
          );
        }

        // Regular select
        return (
          <select
            value={value as string}
            onChange={(e) => handleChange(field.key, e.target.value)}
            style={inputStyle}
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleChange(field.key, e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/30 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-white/70 text-xs">{field.placeholder || 'Enabled'}</span>
          </label>
        );

      case 'animation-file':
        return (
          <div className="space-y-2">
            {/* Current value display */}
            {value && (
              <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10 border border-emerald-500/30">
                <span className="text-xs text-emerald-400 truncate flex-1">
                  {(value as string).split('/').pop()}
                </span>
                <button
                  onClick={() => handleChange(field.key, '')}
                  className="ml-2 text-red-400 hover:text-red-300 text-xs"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Upload button */}
            <div className="flex gap-2">
              <input
                type="file"
                ref={animationInputRef}
                accept={field.accept || '.fbx'}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleAnimationUpload(file, field.key);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                onClick={() => animationInputRef.current?.click()}
                disabled={animationUploading}
                style={{
                  ...inputStyle,
                  cursor: animationUploading ? 'wait' : 'pointer',
                  textAlign: 'center',
                  background: animationUploading ? 'rgba(255,255,255,0.1)' : 'rgba(59, 130, 246, 0.2)',
                  border: '1px solid rgba(59, 130, 246, 0.5)',
                }}
              >
                {animationUploading ? 'Uploading...' : 'Upload FBX'}
              </button>
            </div>

            {/* Existing animations dropdown */}
            {animations.length > 0 && (
              <select
                value={value as string}
                onChange={(e) => handleChange(field.key, e.target.value)}
                style={inputStyle}
              >
                <option value="">Select existing animation...</option>
                {animations.map((anim) => (
                  <option key={anim.filename} value={anim.url}>
                    {anim.filename}
                  </option>
                ))}
              </select>
            )}

            <div className="text-[10px] text-white/40">
              Download idle animations from{' '}
              <a
                href="https://www.mixamo.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                Mixamo
              </a>
              {' '}(FBX format, Without Skin)
            </div>
          </div>
        );

      case 'model-file':
        return (
          <div className="space-y-2">
            {/* Current value display */}
            {value && (
              <div className="flex items-center justify-between p-2 rounded bg-purple-500/10 border border-purple-500/30">
                <span className="text-xs text-purple-400 truncate flex-1">
                  {(value as string).split('/').pop()}
                </span>
                <button
                  onClick={() => handleChange(field.key, '')}
                  className="ml-2 text-red-400 hover:text-red-300 text-xs"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Upload button */}
            <div className="flex gap-2">
              <input
                type="file"
                ref={modelInputRef}
                accept={field.accept || '.vrm'}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleModelUpload(file, field.key);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                onClick={() => modelInputRef.current?.click()}
                disabled={modelUploading}
                style={{
                  ...inputStyle,
                  cursor: modelUploading ? 'wait' : 'pointer',
                  textAlign: 'center',
                  background: modelUploading ? 'rgba(255,255,255,0.1)' : 'rgba(168, 85, 247, 0.2)',
                  border: '1px solid rgba(168, 85, 247, 0.5)',
                }}
              >
                {modelUploading ? 'Uploading...' : 'Upload VRM'}
              </button>
            </div>

            {/* Existing models dropdown */}
            {models.length > 0 && (
              <select
                value={value as string}
                onChange={(e) => handleChange(field.key, e.target.value)}
                style={inputStyle}
              >
                <option value="">Select existing model...</option>
                {models.map((model) => (
                  <option key={model.filename} value={model.url}>
                    {model.filename}
                  </option>
                ))}
              </select>
            )}

            <div className="text-[10px] text-white/40">
              Upload a VRM model file or select from existing uploads.
            </div>
          </div>
        );

      case 'prompt-builder': {
        const sections = (value as PromptSection[]) || [];

        const addSection = (type: 'text' | 'input') => {
          const newSection: PromptSection = {
            id: `section-${Date.now()}`,
            type,
            content: type === 'text' ? '' : `input_${sections.filter(s => s.type === 'input').length + 1}`,
          };
          handleChange(field.key, [...sections, newSection]);
        };

        const updateSection = (id: string, content: string) => {
          const updated = sections.map(s => s.id === id ? { ...s, content } : s);
          handleChange(field.key, updated);
        };

        const removeSection = (id: string) => {
          handleChange(field.key, sections.filter(s => s.id !== id));
        };

        const moveSection = (index: number, direction: 'up' | 'down') => {
          const newIndex = direction === 'up' ? index - 1 : index + 1;
          if (newIndex < 0 || newIndex >= sections.length) return;
          const newSections = [...sections];
          [newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]];
          handleChange(field.key, newSections);
        };

        return (
          <div className="space-y-2">
            {/* Existing sections */}
            {sections.map((section, index) => (
              <div key={section.id} className="relative">
                {section.type === 'text' ? (
                  <div className="border border-white/20 rounded-md overflow-hidden">
                    <div className="flex items-center justify-between px-2 py-1 bg-emerald-500/20 text-[10px] text-emerald-400">
                      <span>Text Block</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveSection(index, 'up')}
                          disabled={index === 0}
                          className="px-1 hover:bg-white/10 rounded disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveSection(index, 'down')}
                          disabled={index === sections.length - 1}
                          className="px-1 hover:bg-white/10 rounded disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeSection(section.id)}
                          className="px-1 hover:bg-red-500/20 rounded text-red-400"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={section.content}
                      onChange={(e) => updateSection(section.id, e.target.value)}
                      placeholder="Enter static text for this part of the prompt..."
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: 'none',
                        background: 'rgba(0,0,0,0.3)',
                        color: '#fff',
                        fontSize: '11px',
                        resize: 'vertical',
                        minHeight: '40px',
                        outline: 'none',
                      }}
                    />
                  </div>
                ) : (
                  <div className="border border-blue-500/30 rounded-md overflow-hidden">
                    <div className="flex items-center justify-between px-2 py-1 bg-blue-500/20 text-[10px] text-blue-400">
                      <span>Input Port (Dynamic)</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveSection(index, 'up')}
                          disabled={index === 0}
                          className="px-1 hover:bg-white/10 rounded disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveSection(index, 'down')}
                          disabled={index === sections.length - 1}
                          className="px-1 hover:bg-white/10 rounded disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeSection(section.id)}
                          className="px-1 hover:bg-red-500/20 rounded text-red-400"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="p-2 bg-black/30">
                      <input
                        type="text"
                        value={section.content}
                        onChange={(e) => updateSection(section.id, e.target.value.replace(/\s/g, '_'))}
                        placeholder="input_name"
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          background: 'rgba(59, 130, 246, 0.1)',
                          color: '#93c5fd',
                          fontSize: '11px',
                          outline: 'none',
                        }}
                      />
                      <div className="text-[9px] text-white/40 mt-1">
                        This will create an input port named "{section.content}"
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add section buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => addSection('text')}
                className="flex-1 py-2 rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[11px] cursor-pointer transition-colors hover:bg-emerald-500/20"
              >
                + Text Block
              </button>
              <button
                onClick={() => addSection('input')}
                className="flex-1 py-2 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-400 text-[11px] cursor-pointer transition-colors hover:bg-blue-500/20"
              >
                + Input Port
              </button>
            </div>

            {/* Info text */}
            {sections.length === 0 && (
              <div className="text-[10px] text-white/40 text-center py-2">
                Build your prompt by adding text blocks and input ports.
                <br />
                Input ports will appear as connection points on the node.
              </div>
            )}
          </div>
        );
      }

      case 'input-list':
        return (
          <InputListField
            value={(value as string[]) || []}
            onChange={(newValue) => handleChange(field.key, newValue)}
            placeholder={field.placeholder}
          />
        );

      case 'expression-list':
        return (
          <ExpressionListField
            value={(value as Expression[]) || []}
            onChange={(newValue) => handleChange(field.key, newValue)}
          />
        );

      case 'password':
        return (
          <input
            type="password"
            value={value as string}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            style={inputStyle}
          />
        );

      case 'png-expression-map': {
        // Parse existing JSON config or use default
        let pngConfig: PngConfig;
        if (typeof value === 'string') {
          try {
            pngConfig = JSON.parse(value);
          } catch {
            pngConfig = { baseUrl: '/images/avatar/', expressions: {} };
          }
        } else if (value && typeof value === 'object') {
          pngConfig = value as PngConfig;
        } else {
          pngConfig = { baseUrl: '/images/avatar/', expressions: {} };
        }

        return (
          <PngExpressionMapField
            value={pngConfig}
            onChange={(newValue) => handleChange(field.key, newValue)}
            onUploadImage={handleAvatarImageUpload}
            availableImages={avatarImages}
          />
        );
      }

      default:
        return null;
    }
  };

  // Helper to get translated label for a node type
  const getNodeLabel = (nodeType: string): string => {
    const keyMap: Record<string, string> = {
      'start': 'nodeConfig.start.label',
      'end': 'nodeConfig.end.label',
      'loop': 'nodeConfig.loop.label',
      'foreach': 'nodeConfig.foreach.label',
      'youtube-chat': 'nodeConfig.youtubeChat.label',
      'twitch-chat': 'nodeConfig.twitchChat.label',
      'openai-llm': 'nodeConfig.openaiLlm.label',
      'anthropic-llm': 'nodeConfig.anthropicLlm.label',
      'google-llm': 'nodeConfig.googleLlm.label',
      'ollama-llm': 'nodeConfig.ollamaLlm.label',
      'voicevox-tts': 'nodeConfig.voicevoxTts.label',
      'coeiroink-tts': 'nodeConfig.coeiroinkTts.label',
      'sbv2-tts': 'nodeConfig.sbv2Tts.label',
      'manual-input': 'nodeConfig.manualInput.label',
      'console-output': 'nodeConfig.consoleOutput.label',
      'switch': 'nodeConfig.switch.label',
      'delay': 'nodeConfig.delay.label',
      'http-request': 'nodeConfig.httpRequest.label',
      'text-transform': 'nodeConfig.textTransform.label',
      'random': 'nodeConfig.random.label',
      'timer': 'nodeConfig.timer.label',
      'variable': 'nodeConfig.variable.label',
      'avatar-configuration': 'nodeConfig.avatarConfiguration.label',
      'motion-trigger': 'nodeConfig.motionTrigger.label',
      'emotion-analyzer': 'nodeConfig.emotionAnalyzer.label',
      'lip-sync': 'nodeConfig.lipSync.label',
      'avatar-display': 'nodeConfig.avatarDisplay.label',
      'audio-player': 'nodeConfig.audioPlayer.label',
      'subtitle-display': 'nodeConfig.subtitleDisplay.label',
      'obs-scene-switch': 'nodeConfig.obsSceneSwitch.label',
      'obs-source-toggle': 'nodeConfig.obsSourceToggle.label',
    };
    const key = keyMap[nodeType];
    return key ? t(key) : schema?.label || nodeType;
  };

  // Helper to get translated label for a field
  const getFieldLabel = (nodeType: string, fieldKey: string, fallbackLabel: string): string => {
    // Map node types to translation key prefixes
    const nodeKeyMap: Record<string, string> = {
      'start': 'start',
      'end': 'end',
      'loop': 'loop',
      'foreach': 'foreach',
      'youtube-chat': 'youtubeChat',
      'twitch-chat': 'twitchChat',
      'openai-llm': 'openaiLlm',
      'anthropic-llm': 'anthropicLlm',
      'google-llm': 'googleLlm',
      'ollama-llm': 'ollamaLlm',
      'voicevox-tts': 'voicevoxTts',
      'coeiroink-tts': 'coeiroinkTts',
      'sbv2-tts': 'sbv2Tts',
      'manual-input': 'manualInput',
      'console-output': 'consoleOutput',
      'switch': 'switch',
      'delay': 'delay',
      'http-request': 'httpRequest',
      'text-transform': 'textTransform',
      'random': 'random',
      'timer': 'timer',
      'variable': 'variable',
      'avatar-configuration': 'avatarConfiguration',
      'motion-trigger': 'motionTrigger',
      'emotion-analyzer': 'emotionAnalyzer',
      'lip-sync': 'lipSync',
      'avatar-display': 'avatarDisplay',
      'audio-player': 'audioPlayer',
      'subtitle-display': 'subtitleDisplay',
      'obs-scene-switch': 'obsSceneSwitch',
      'obs-source-toggle': 'obsSourceToggle',
    };

    // Convert snake_case field key to camelCase
    const toCamelCase = (str: string) => str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

    const nodePrefix = nodeKeyMap[nodeType];
    if (!nodePrefix) return fallbackLabel;

    const fieldKeyCamel = toCamelCase(fieldKey);
    const translationKey = `nodeConfig.${nodePrefix}.${fieldKeyCamel}`;
    const translated = t(translationKey);

    // If translation returns the key itself, fall back to the original label
    return translated !== translationKey ? translated : fallbackLabel;
  };

  return (
    <div className="p-4 flex-1 overflow-auto">
      <h3 className="text-xs text-white/50 uppercase tracking-wider mb-3 m-0">
        {t('settings.nodeSettings')}
      </h3>
      <div
        className="p-3 rounded-lg"
        style={{ background: 'rgba(0,0,0,0.3)' }}
      >
        {/* Node Type */}
        <div className="mb-3">
          <label className="block text-[11px] text-white/60 mb-1">{t('nodeConfig.nodeType')}</label>
          <div className="text-white font-medium text-sm">{getNodeLabel(selectedNode.type)}</div>
        </div>

        {/* Config Fields */}
        {schema?.fields.map((field) => {
          // Check showWhen condition
          if (field.showWhen) {
            const conditionValue = localConfig[field.showWhen.key];
            const expectedValues = Array.isArray(field.showWhen.value)
              ? field.showWhen.value
              : [field.showWhen.value];
            if (!expectedValues.includes(conditionValue as string)) {
              return null;
            }
          }
          return (
            <div key={field.key} className="mb-3">
              <label className="block text-[11px] text-white/60 mb-1">
                {getFieldLabel(selectedNode.type, field.key, field.label)}
              </label>
              {renderField(field)}
            </div>
          );
        })}

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          className="w-full mt-2 py-2 rounded-md border border-red-500/50 bg-red-500/10 text-red-400 text-xs cursor-pointer transition-colors hover:bg-red-500/20"
        >
          {t('nodeConfig.deleteNode')}
        </button>
      </div>
    </div>
  );
}
