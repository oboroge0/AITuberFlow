'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';
import api, { VoicevoxSpeaker, AnimationInfo } from '@/lib/api';

interface NodeField {
  key: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'animation-file';
  label: string;
  placeholder?: string;
  options?: { label: string; value: string | number }[];
  dynamic?: boolean; // For dynamically loaded options
  accept?: string; // For file inputs
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
      { key: 'apiKey', type: 'text', label: 'API Key', placeholder: 'sk-...' },
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
      { key: 'temperature', type: 'number', label: 'Temperature', placeholder: '0.7' },
    ],
  },
  'anthropic-llm': {
    label: 'Claude (Anthropic)',
    fields: [
      { key: 'apiKey', type: 'text', label: 'API Key', placeholder: 'sk-ant-...' },
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
      { key: 'apiKey', type: 'text', label: 'API Key', placeholder: 'AI...' },
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
      { key: 'template', type: 'textarea', label: 'Template', placeholder: '{{text}} を変換' },
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
  'emotion-analyzer': {
    label: 'Emotion Analyzer',
    fields: [
      {
        key: 'method',
        type: 'select',
        label: 'Analysis Method',
        options: [
          { label: 'Rule-based (Keywords)', value: 'rule-based' },
          { label: 'LLM-based', value: 'llm' },
        ],
      },
      {
        key: 'language',
        type: 'select',
        label: 'Language',
        options: [
          { label: 'Japanese', value: 'ja' },
          { label: 'English', value: 'en' },
          { label: 'Auto-detect', value: 'auto' },
        ],
      },
      { key: 'custom_mappings', type: 'textarea', label: 'Custom Emotion Mappings (JSON)', placeholder: '{"happy": ["keyword1", "keyword2"]}' },
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
      { key: 'model_url', type: 'text', label: 'Model URL/Path', placeholder: '/models/avatar.vrm' },
      { key: 'animation_url', type: 'animation-file', label: 'Idle Animation (FBX)', placeholder: 'Upload Mixamo FBX...', accept: '.fbx' },
      { key: 'vtube_port', type: 'number', label: 'VTube Studio Port', placeholder: '8001' },
      { key: 'png_config', type: 'textarea', label: 'PNG Configuration (JSON)', placeholder: '{"baseUrl": "/images/avatar.png", "expressions": {}}' },
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
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  const [voicevoxSpeakers, setVoicevoxSpeakers] = useState<VoicevoxSpeaker[]>([]);
  const [voicevoxLoading, setVoicevoxLoading] = useState(false);
  const [voicevoxError, setVoicevoxError] = useState<string | null>(null);
  const [animations, setAnimations] = useState<AnimationInfo[]>([]);
  const [animationUploading, setAnimationUploading] = useState(false);
  const animationInputRef = useRef<HTMLInputElement>(null);

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

      // Fetch animations if this is an avatar-display node
      if (selectedNode.type === 'avatar-display') {
        fetchAnimations();
      }
    }
  }, [selectedNode, fetchVoicevoxSpeakers, fetchAnimations]);

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

      default:
        return null;
    }
  };

  return (
    <div className="p-4 flex-1 overflow-auto">
      <h3 className="text-xs text-white/50 uppercase tracking-wider mb-3 m-0">
        Node Settings
      </h3>
      <div
        className="p-3 rounded-lg"
        style={{ background: 'rgba(0,0,0,0.3)' }}
      >
        {/* Node Type */}
        <div className="mb-3">
          <label className="block text-[11px] text-white/60 mb-1">Node Type</label>
          <div className="text-white font-medium text-sm">{schema?.label || selectedNode.type}</div>
        </div>

        {/* Config Fields */}
        {schema?.fields.map((field) => (
          <div key={field.key} className="mb-3">
            <label className="block text-[11px] text-white/60 mb-1">{field.label}</label>
            {renderField(field)}
          </div>
        ))}

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          className="w-full mt-2 py-2 rounded-md border border-red-500/50 bg-red-500/10 text-red-400 text-xs cursor-pointer transition-colors hover:bg-red-500/20"
        >
          Delete Node
        </button>
      </div>
    </div>
  );
}
