'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';
import api, { VoicevoxSpeaker } from '@/lib/api';

interface NodeField {
  key: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'checkbox';
  label: string;
  placeholder?: string;
  options?: { label: string; value: string | number }[];
  dynamic?: boolean; // For dynamically loaded options
}

// Simplified node config schemas
const nodeConfigs: Record<string, { label: string; fields: NodeField[] }> = {
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
    label: 'LLM',
    fields: [
      { key: 'apiKey', type: 'text', label: 'API Key', placeholder: 'sk-...' },
      {
        key: 'model',
        type: 'select',
        label: 'Model',
        options: [
          { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
          { label: 'GPT-4o', value: 'gpt-4o' },
          { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
        ],
      },
      { key: 'systemPrompt', type: 'textarea', label: 'System Prompt', placeholder: 'Enter character settings...' },
    ],
  },
  'voicevox-tts': {
    label: 'TTS',
    fields: [
      { key: 'host', type: 'text', label: 'VOICEVOX Host', placeholder: 'http://localhost:50021' },
      {
        key: 'speaker',
        type: 'select',
        label: 'Speaker',
        dynamic: true, // Will be loaded from API
        options: [], // Will be populated dynamically
      },
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
    ],
  },
};

export default function NodeSettings() {
  const { selectedNodeId, nodes, updateNode, removeNode } = useWorkflowStore();
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  const [voicevoxSpeakers, setVoicevoxSpeakers] = useState<VoicevoxSpeaker[]>([]);
  const [voicevoxLoading, setVoicevoxLoading] = useState(false);
  const [voicevoxError, setVoicevoxError] = useState<string | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

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
    }
  }, [selectedNode, fetchVoicevoxSpeakers]);

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
