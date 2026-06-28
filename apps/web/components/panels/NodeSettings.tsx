"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useWorkflowStore } from "@/stores/workflowStore";
import { useTranslation } from "@/stores/localeStore";
import { usePluginStore } from "@/stores/pluginStore";
import api, { VoicevoxSpeaker, AnimationInfo, ModelInfo } from "@/lib/api";
import { manifestConfigToNodeFields, evaluateShowWhen, normalizeOptions } from "@/lib/configUtils";
import { useSettingsStore } from "@/stores/settingsStore";
import { GLOBAL_SETTINGS_MAP } from "@/lib/globalSettingsMap";
import { LLM_MODEL_OPTIONS } from "@/lib/constants";
import type { NodeField } from "@/lib/types";
import { toast } from "@/stores/toastStore";

// Prompt section for structured prompt building
export interface PromptSection {
  id: string;
  type: "text" | "input";
  content: string; // For text: the actual text, For input: the input port name
}

// Separate component for password field with show/hide toggle
interface PasswordFieldProps {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

function PasswordField({
  value,
  onChange,
  placeholder,
  style,
}: PasswordFieldProps) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...style, paddingRight: "36px" }}
      />
      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        aria-label={showPassword ? t("settings.hidePassword") : t("settings.showPassword")}
        aria-pressed={showPassword}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors"
        title={showPassword ? t("settings.hidePassword") : t("settings.showPassword")}
      >
        {showPassword ? (
          // Eye-off icon
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          // Eye icon
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

// Separate component for input-list field to properly use hooks
interface InputListFieldProps {
  value: string[];
  onChange: (newValue: string[]) => void;
  placeholder?: string;
}

function InputListField({ value, onChange, placeholder }: InputListFieldProps) {
  const { t } = useTranslation();
  const [newInput, setNewInput] = useState("");
  const inputs = value || [];

  const addInput = () => {
    const trimmed = newInput.trim().replace(/\s/g, "_");
    if (trimmed && !inputs.includes(trimmed)) {
      onChange([...inputs, trimmed]);
      setNewInput("");
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
          onKeyDown={(e) => e.key === "Enter" && addInput()}
          placeholder={placeholder || "input_name"}
          style={{
            flex: 1,
            padding: "6px 8px",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(0,0,0,0.3)",
            color: "#fff",
            fontSize: "11px",
            outline: "none",
          }}
        />
        <button
          onClick={addInput}
          className="px-3 py-1 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-400 text-[11px] cursor-pointer hover:bg-blue-500/20"
        >
          {t('nodeConfig.common.add')}
        </button>
      </div>

      {/* Help text */}
      <div className="text-[9px] text-white/40">
        {t('settings.addInputHelp')}
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
// NOTE: Authoritative source with full keyword lists is in plugins/emotion-analyzer/node.ts.
// This UI-side copy is used for the "Load Defaults" button in expression list editor.
const DEFAULT_EXPRESSIONS: Expression[] = [
  {
    id: "neutral",
    label: "Neutral",
    description: "Default calm state, no strong emotion",
  },
  {
    id: "happy",
    label: "Happy",
    description: "Joy, excitement, gratitude, amusement, laughter",
  },
  {
    id: "sad",
    label: "Sad",
    description: "Sadness, disappointment, loneliness, regret, apology",
  },
  {
    id: "angry",
    label: "Angry",
    description: "Anger, frustration, irritation, annoyance, displeasure",
  },
  {
    id: "surprised",
    label: "Surprised",
    description: "Surprise, shock, amazement, disbelief, astonishment",
  },
  {
    id: "relaxed",
    label: "Relaxed",
    description: "Calm, peaceful, comfortable, relieved, content",
  },
];

// Separate component for expression-list field
interface ExpressionListFieldProps {
  value: Expression[];
  onChange: (newValue: Expression[]) => void;
}

function ExpressionListField({ value, onChange }: ExpressionListFieldProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newExpr, setNewExpr] = useState<Partial<Expression>>({
    id: "",
    label: "",
    description: "",
  });
  const expressions = value || [];

  const loadDefaults = () => {
    onChange(DEFAULT_EXPRESSIONS);
  };

  const addExpression = () => {
    const trimmedId =
      newExpr.id?.trim().toLowerCase().replace(/\s+/g, "-") || "";
    const trimmedLabel = newExpr.label?.trim() || "";
    const trimmedDesc = newExpr.description?.trim() || "";

    if (!trimmedId || !trimmedLabel) return;
    if (expressions.some((e) => e.id === trimmedId)) return;

    const newExpression: Expression = {
      id: trimmedId,
      label: trimmedLabel,
      description: trimmedDesc,
      keywords_ja: [],
      keywords_en: [],
    };

    onChange([...expressions, newExpression]);
    setNewExpr({ id: "", label: "", description: "" });
  };

  const removeExpression = (id: string) => {
    onChange(expressions.filter((e) => e.id !== id));
  };

  const updateExpression = (id: string, updates: Partial<Expression>) => {
    onChange(expressions.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  };

  const inputStyle = {
    padding: "6px 8px",
    borderRadius: "4px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(0,0,0,0.3)",
    color: "#fff",
    fontSize: "11px",
    outline: "none",
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
                    onChange={(e) =>
                      updateExpression(expr.id, { label: e.target.value })
                    }
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
                  onChange={(e) =>
                    updateExpression(expr.id, { description: e.target.value })
                  }
                  placeholder={t('settings.descriptionForLlmPlaceholder')}
                  rows={2}
                  style={{ ...inputStyle, width: "100%", resize: "vertical" }}
                />
                <div className="text-[9px] text-white/40">
                  ID: {expr.id} (cannot be changed)
                </div>
              </div>
            ) : (
              // View mode
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white font-medium">
                    {expr.label}
                  </div>
                  <div className="text-[10px] text-white/50">ID: {expr.id}</div>
                  <div className="text-[10px] text-white/40 truncate">
                    {expr.description}
                  </div>
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
            value={newExpr.id || ""}
            onChange={(e) => setNewExpr({ ...newExpr, id: e.target.value })}
            placeholder={t('settings.expressionIdPlaceholder')}
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="text"
            value={newExpr.label || ""}
            onChange={(e) => setNewExpr({ ...newExpr, label: e.target.value })}
            placeholder="Label"
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newExpr.description || ""}
            onChange={(e) =>
              setNewExpr({ ...newExpr, description: e.target.value })
            }
            placeholder={t('settings.descriptionForLlm')}
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
        Expressions define emotions the LLM can detect. The ID must match your
        avatar&apos;s expression/image names.
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

function PngExpressionMapField({
  value,
  onChange,
  onUploadImage,
}: PngExpressionMapFieldProps) {
  const { t } = useTranslation();
  const [newMapping, setNewMapping] = useState<PngExpressionMapping>({
    id: "",
    filename: "",
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config: PngConfig = value || {
    baseUrl: "/images/avatar/",
    expressions: {},
  };
  const mappings = Object.entries(config.expressions || {}).map(
    ([id, filename]) => ({ id, filename }),
  );

  const updateBaseUrl = (baseUrl: string) => {
    onChange({ ...config, baseUrl });
  };

  const addMapping = () => {
    const trimmedId = newMapping.id.trim().toLowerCase().replace(/\s+/g, "-");
    const trimmedFilename = newMapping.filename.trim();

    if (!trimmedId || !trimmedFilename) return;
    if (config.expressions[trimmedId]) return;

    onChange({
      ...config,
      expressions: { ...config.expressions, [trimmedId]: trimmedFilename },
    });
    setNewMapping({ id: "", filename: "" });
  };

  const removeMapping = (id: string) => {
    const newExpressions = { ...config.expressions };
    delete newExpressions[id];
    onChange({ ...config, expressions: newExpressions });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const url = await onUploadImage(file);
      if (url) {
        const filename = url.split("/").pop() || file.name;
        setNewMapping({ ...newMapping, filename });
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const loadDefaultMappings = () => {
    onChange({
      ...config,
      expressions: {
        neutral: "neutral.png",
        happy: "happy.png",
        sad: "sad.png",
        angry: "angry.png",
        surprised: "surprised.png",
        relaxed: "relaxed.png",
      },
    });
  };

  const inputStyle = {
    padding: "6px 8px",
    borderRadius: "4px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(0,0,0,0.3)",
    color: "#fff",
    fontSize: "11px",
    outline: "none",
  };

  return (
    <div className="space-y-3">
      {/* Base URL */}
      <div>
        <label className="block text-[10px] text-white/50 mb-1">
          Base URL (画像フォルダ)
        </label>
        <input
          type="text"
          value={config.baseUrl}
          onChange={(e) => updateBaseUrl(e.target.value)}
          placeholder="/images/avatar/"
          style={{ ...inputStyle, width: "100%" }}
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
                <span className="text-xs text-white/70 truncate">
                  {filename}
                </span>
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
        <div className="text-[10px] text-white/50 mb-2">
          Add Expression Mapping
        </div>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newMapping.id}
            onChange={(e) =>
              setNewMapping({ ...newMapping, id: e.target.value })
            }
            placeholder={t('settings.expressionIdPlaceholder')}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newMapping.filename}
            onChange={(e) =>
              setNewMapping({ ...newMapping, filename: e.target.value })
            }
            placeholder={t('settings.imageFilenamePlaceholder')}
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
            {uploading ? "..." : "Upload"}
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

// Global settings field mapping moved to the shared module so the inline
// node fields (CustomNode) and this panel stay in sync.
// (mirrors server-side GLOBAL_SETTINGS_MAP)

// LLM_MODEL_OPTIONS imported from @/lib/constants

// Simplified node config schemas
const nodeConfigs: Record<string, { label: string; fields: NodeField[] }> = {
  start: {
    label: "Start",
    fields: [
      {
        key: "autoStart",
        type: "checkbox",
        label: "Auto Start",
        placeholder: "Start automatically when workflow runs",
      },
    ],
  },
  end: {
    label: "End",
    fields: [
      {
        key: "message",
        type: "text",
        label: "Completion Message",
        placeholder: "Workflow completed",
      },
    ],
  },
  loop: {
    label: "Loop",
    fields: [
      {
        key: "mode",
        type: "select",
        label: "Loop Mode",
        options: [
          { label: "Count", value: "count" },
          { label: "While Condition", value: "while" },
          { label: "Infinite", value: "infinite" },
        ],
      },
      { key: "count", type: "number", label: "Loop Count", placeholder: "3" },
      {
        key: "condition",
        type: "text",
        label: "Condition (for While)",
        placeholder: "{{value}} > 0",
      },
      {
        key: "maxIterations",
        type: "number",
        label: "Max Iterations (safety)",
        placeholder: "100",
      },
    ],
  },
  foreach: {
    label: "ForEach",
    fields: [
      {
        key: "separator",
        type: "text",
        label: "Separator",
        placeholder: "\\n (newline) or , (comma)",
      },
    ],
  },
  "youtube-chat": {
    label: "YouTube Chat",
    fields: [
      {
        key: "videoId",
        type: "text",
        label: "Video ID",
        placeholder: "dQw4w9WgXcQ",
      },
      {
        key: "apiKey",
        type: "password",
        label: "API Key",
        placeholder: "Your YouTube API key",
      },
    ],
  },
  "twitch-chat": {
    label: "Twitch Chat",
    fields: [
      {
        key: "channel",
        type: "text",
        label: "Channel",
        placeholder: "Channel name",
      },
    ],
  },
  "discord-chat": {
    label: "Discord Chat",
    fields: [
      {
        key: "botToken",
        type: "password",
        label: "Bot Token",
        placeholder: "Your Discord bot token",
      },
      {
        key: "channelIds",
        type: "text",
        label: "Channel IDs",
        placeholder: "Comma-separated (empty = all)",
      },
      { key: "filterBots", type: "checkbox", label: "Filter Bot Messages" },
      { key: "mentionOnly", type: "checkbox", label: "Mention Only" },
    ],
  },
  "openai-llm": {
    label: "ChatGPT (OpenAI)",
    fields: [
      {
        key: "apiKey",
        type: "password",
        label: "API Key",
        placeholder: "sk-...",
      },
      {
        key: "model",
        type: "select",
        label: "Model",
        options: LLM_MODEL_OPTIONS.openai,
      },
      {
        key: "systemPrompt",
        type: "textarea",
        label: "System Prompt",
        placeholder: "Enter character settings...",
      },
      {
        key: "promptSections",
        type: "prompt-builder",
        label: "Prompt Builder",
      },
      {
        key: "temperature",
        type: "number",
        label: "Temperature",
        placeholder: "0.7",
      },
    ],
  },
  "anthropic-llm": {
    label: "Claude (Anthropic)",
    fields: [
      {
        key: "apiKey",
        type: "password",
        label: "API Key",
        placeholder: "sk-ant-...",
      },
      {
        key: "model",
        type: "select",
        label: "Model",
        options: LLM_MODEL_OPTIONS.anthropic,
      },
      {
        key: "systemPrompt",
        type: "textarea",
        label: "System Prompt",
        placeholder: "Enter character settings...",
      },
      {
        key: "maxTokens",
        type: "number",
        label: "Max Tokens",
        placeholder: "1024",
      },
      {
        key: "temperature",
        type: "number",
        label: "Temperature",
        placeholder: "0.7",
      },
    ],
  },
  "google-llm": {
    label: "Gemini (Google)",
    fields: [
      {
        key: "apiKey",
        type: "password",
        label: "API Key",
        placeholder: "AI...",
      },
      {
        key: "model",
        type: "select",
        label: "Model",
        options: LLM_MODEL_OPTIONS.google,
      },
      {
        key: "systemPrompt",
        type: "textarea",
        label: "System Prompt",
        placeholder: "Enter character settings...",
      },
      {
        key: "maxTokens",
        type: "number",
        label: "Max Tokens",
        placeholder: "1024",
      },
      {
        key: "temperature",
        type: "number",
        label: "Temperature",
        placeholder: "0.7",
      },
    ],
  },
  "ollama-llm": {
    label: "LLM (Ollama)",
    fields: [
      {
        key: "host",
        type: "text",
        label: "Ollama Host",
        placeholder: "http://localhost:11434",
      },
      {
        key: "model",
        type: "text",
        label: "Model",
        placeholder: "llama3.2, mistral, gemma2...",
      },
      {
        key: "systemPrompt",
        type: "textarea",
        label: "System Prompt",
        placeholder: "Enter character settings...",
      },
      {
        key: "temperature",
        type: "number",
        label: "Temperature",
        placeholder: "0.7",
      },
      {
        key: "contextLength",
        type: "number",
        label: "Context Length",
        placeholder: "4096",
      },
    ],
  },
  "mistral-llm": {
    label: "LLM (Mistral)",
    fields: [
      {
        key: "apiKey",
        type: "password",
        label: "API Key",
        placeholder: "...",
      },
      {
        key: "model",
        type: "select",
        label: "Model",
        options: LLM_MODEL_OPTIONS.mistral,
      },
      {
        key: "systemPrompt",
        type: "textarea",
        label: "System Prompt",
        placeholder: "Enter character settings...",
      },
      {
        key: "promptSections",
        type: "prompt-builder",
        label: "Prompt Builder",
      },
      {
        key: "temperature",
        type: "number",
        label: "Temperature",
        placeholder: "0.7",
      },
    ],
  },
  "groq-llm": {
    label: "LLM (Groq)",
    fields: [
      {
        key: "apiKey",
        type: "password",
        label: "API Key",
        placeholder: "gsk_...",
      },
      {
        key: "model",
        type: "select",
        label: "Model",
        options: LLM_MODEL_OPTIONS.groq,
      },
      {
        key: "systemPrompt",
        type: "textarea",
        label: "System Prompt",
        placeholder: "Enter character settings...",
      },
      {
        key: "promptSections",
        type: "prompt-builder",
        label: "Prompt Builder",
      },
      {
        key: "temperature",
        type: "number",
        label: "Temperature",
        placeholder: "0.7",
      },
    ],
  },
  "voicevox-tts": {
    label: "TTS (VOICEVOX)",
    fields: [
      {
        key: "host",
        type: "text",
        label: "VOICEVOX Host",
        placeholder: "http://localhost:50021",
      },
      {
        key: "speaker",
        type: "select",
        label: "Speaker",
        dynamic: true,
        options: [],
      },
      { key: "speedScale", type: "number", label: "Speed", placeholder: "1.0" },
      { key: "demoMode", type: "checkbox", label: "Demo Mode" },
    ],
  },
  "coeiroink-tts": {
    label: "TTS (COEIROINK)",
    fields: [
      {
        key: "host",
        type: "text",
        label: "COEIROINK Host",
        placeholder: "http://localhost:50032",
      },
      {
        key: "speakerUuid",
        type: "text",
        label: "Speaker UUID",
        placeholder: "Get from COEIROINK",
      },
      { key: "styleId", type: "number", label: "Style ID", placeholder: "0" },
      { key: "speedScale", type: "number", label: "Speed", placeholder: "1.0" },
      { key: "pitchScale", type: "number", label: "Pitch", placeholder: "1.0" },
      { key: "demoMode", type: "checkbox", label: "Demo Mode" },
    ],
  },
  "sbv2-tts": {
    label: "TTS (Style-Bert-VITS2)",
    fields: [
      {
        key: "host",
        type: "text",
        label: "SBV2 Host",
        placeholder: "http://localhost:5000",
      },
      {
        key: "modelName",
        type: "text",
        label: "Model Name",
        placeholder: "Model name",
      },
      {
        key: "speakerId",
        type: "number",
        label: "Speaker ID",
        placeholder: "0",
      },
      {
        key: "style",
        type: "text",
        label: "Style",
        placeholder: "Neutral, Happy, Sad...",
      },
      {
        key: "styleWeight",
        type: "number",
        label: "Style Weight",
        placeholder: "1.0",
      },
      { key: "length", type: "number", label: "Speed", placeholder: "1.0" },
      { key: "demoMode", type: "checkbox", label: "Demo Mode" },
    ],
  },
  "aivis-tts": {
    label: "TTS (AivisSpeech)",
    fields: [
      {
        key: "host",
        type: "text",
        label: "AivisSpeech Host",
        placeholder: "http://localhost:10101",
      },
      {
        key: "speaker",
        type: "select",
        label: "Speaker",
        dynamic: true,
        options: [],
      },
      { key: "speedScale", type: "number", label: "Speed", placeholder: "1.0" },
      { key: "demoMode", type: "checkbox", label: "Demo Mode" },
    ],
  },
  "openai-tts": {
    label: "TTS (OpenAI)",
    fields: [
      {
        key: "apiKey",
        type: "password",
        label: "API Key",
        placeholder: "sk-...",
      },
      {
        key: "model",
        type: "select",
        label: "Model",
        options: [
          { label: "TTS-1 (Standard)", value: "tts-1" },
          { label: "TTS-1 HD (High Quality)", value: "tts-1-hd" },
          { label: "GPT-4o Mini TTS", value: "gpt-4o-mini-tts" },
        ],
      },
      {
        key: "voice",
        type: "select",
        label: "Voice",
        options: [
          { label: "Alloy", value: "alloy" },
          { label: "Ash", value: "ash" },
          { label: "Coral", value: "coral" },
          { label: "Echo", value: "echo" },
          { label: "Fable", value: "fable" },
          { label: "Nova", value: "nova" },
          { label: "Onyx", value: "onyx" },
          { label: "Shimmer", value: "shimmer" },
        ],
      },
      { key: "speed", type: "number", label: "Speed", placeholder: "1.0" },
    ],
  },
  "manual-input": {
    label: "Manual Input",
    fields: [
      {
        key: "inputText",
        type: "textarea",
        label: "Text",
        placeholder: "Enter text to send...",
      },
    ],
  },
  "console-output": {
    label: "Console Output",
    fields: [
      { key: "prefix", type: "text", label: "Prefix", placeholder: "[Output]" },
    ],
  },
  switch: {
    label: "Switch",
    fields: [
      {
        key: "mode",
        type: "select",
        label: "Mode",
        options: [
          { label: "Truthy/Falsy", value: "truthy" },
          { label: "Equals", value: "equals" },
          { label: "Contains", value: "contains" },
        ],
      },
      {
        key: "compareValue",
        type: "text",
        label: "Compare Value",
        placeholder: "Value to compare",
      },
    ],
  },
  delay: {
    label: "Delay",
    fields: [
      {
        key: "delayMs",
        type: "number",
        label: "Delay (ms)",
        placeholder: "1000",
      },
      { key: "randomize", type: "checkbox", label: "Randomize" },
      {
        key: "randomMin",
        type: "number",
        label: "Random Min (ms)",
        placeholder: "500",
      },
      {
        key: "randomMax",
        type: "number",
        label: "Random Max (ms)",
        placeholder: "2000",
      },
    ],
  },
  "http-request": {
    label: "HTTP Request",
    fields: [
      {
        key: "url",
        type: "text",
        label: "URL",
        placeholder: "https://api.example.com/...",
      },
      {
        key: "method",
        type: "select",
        label: "Method",
        options: [
          { label: "GET", value: "GET" },
          { label: "POST", value: "POST" },
          { label: "PUT", value: "PUT" },
          { label: "DELETE", value: "DELETE" },
          { label: "PATCH", value: "PATCH" },
        ],
      },
      {
        key: "headers",
        type: "textarea",
        label: "Headers (JSON)",
        placeholder: '{"Authorization": "Bearer ..."}',
      },
      {
        key: "timeout",
        type: "number",
        label: "Timeout (ms)",
        placeholder: "30000",
      },
    ],
  },
  "text-transform": {
    label: "Text Transform",
    fields: [
      {
        key: "operation",
        type: "select",
        label: "Operation",
        options: [
          { label: "Template", value: "template" },
          { label: "Uppercase", value: "uppercase" },
          { label: "Lowercase", value: "lowercase" },
          { label: "Trim", value: "trim" },
          { label: "Replace", value: "replace" },
          { label: "Prefix", value: "prefix" },
          { label: "Suffix", value: "suffix" },
          { label: "Split First", value: "split_first" },
          { label: "Split Last", value: "split_last" },
          { label: "Length", value: "length" },
        ],
      },
      {
        key: "template",
        type: "textarea",
        label: "Template",
        placeholder: "{{author}}さん: {{message}}",
      },
      {
        key: "templateInputs",
        type: "input-list",
        label: "Template Inputs",
        placeholder: "author, message...",
      },
      {
        key: "find",
        type: "text",
        label: "Find (for Replace)",
        placeholder: "Text to find",
      },
      {
        key: "replaceWith",
        type: "text",
        label: "Replace With",
        placeholder: "Replacement text",
      },
      {
        key: "delimiter",
        type: "text",
        label: "Delimiter (for Split)",
        placeholder: " ",
      },
    ],
  },
  random: {
    label: "Random",
    fields: [
      {
        key: "mode",
        type: "select",
        label: "Mode",
        options: [
          { label: "Number", value: "number" },
          { label: "Choice", value: "choice" },
          { label: "Boolean", value: "boolean" },
        ],
      },
      {
        key: "min",
        type: "number",
        label: "Min (for Number)",
        placeholder: "0",
      },
      {
        key: "max",
        type: "number",
        label: "Max (for Number)",
        placeholder: "100",
      },
      {
        key: "choices",
        type: "text",
        label: "Choices (comma separated)",
        placeholder: "option1, option2, option3",
      },
      {
        key: "trueProbability",
        type: "number",
        label: "True Probability % (for Boolean)",
        placeholder: "50",
      },
    ],
  },
  timer: {
    label: "Timer",
    fields: [
      {
        key: "intervalMs",
        type: "number",
        label: "Interval (ms)",
        placeholder: "5000",
      },
      {
        key: "maxTicks",
        type: "number",
        label: "Max Ticks (0=unlimited)",
        placeholder: "0",
      },
      { key: "immediate", type: "checkbox", label: "Fire Immediately" },
    ],
  },
  variable: {
    label: "Variable",
    fields: [
      {
        key: "name",
        type: "text",
        label: "Variable Name",
        placeholder: "myVariable",
      },
      {
        key: "defaultValue",
        type: "text",
        label: "Default Value",
        placeholder: "Default value",
      },
      {
        key: "valueType",
        type: "select",
        label: "Value Type",
        options: [
          { label: "String", value: "string" },
          { label: "Number", value: "number" },
          { label: "Boolean", value: "boolean" },
          { label: "JSON", value: "json" },
        ],
      },
    ],
  },
  // Avatar nodes
  "avatar-configuration": {
    label: "Avatar Configuration",
    fields: [
      {
        key: "renderer",
        type: "select",
        label: "Renderer",
        options: [
          { label: "VRM (Built-in)", value: "vrm" },
          { label: "VTube Studio", value: "vtube-studio" },
          { label: "PNG Images", value: "png" },
        ],
      },
      // VRM settings
      {
        key: "modelUrl",
        type: "model-file",
        label: "VRM Model",
        placeholder: "Upload VRM model...",
        accept: ".vrm",
        showWhen: { key: "renderer", value: "vrm" },
      },
      {
        key: "idleAnimation",
        type: "animation-file",
        label: "Idle Animation (FBX)",
        placeholder: "Upload Mixamo FBX...",
        accept: ".fbx",
        showWhen: { key: "renderer", value: "vrm" },
      },
      // VTube Studio settings
      {
        key: "vtubePort",
        type: "number",
        label: "VTube Studio Port",
        placeholder: "8001",
        showWhen: { key: "renderer", value: "vtube-studio" },
      },
      // PNG settings
      {
        key: "pngConfig",
        type: "png-expression-map",
        label: "PNG Expression Mappings",
        showWhen: { key: "renderer", value: "png" },
      },
    ],
  },
  "motion-trigger": {
    label: "Motion Trigger",
    fields: [
      {
        key: "expression",
        type: "text",
        label: "Expression ID",
        placeholder: "happy, sad, smug, etc.",
      },
      {
        key: "intensity",
        type: "number",
        label: "Expression Intensity (0.0-1.0)",
        placeholder: "0.8",
      },
      {
        key: "motionUrl",
        type: "animation-file",
        label: "Motion Animation (FBX)",
        placeholder: "Upload Mixamo FBX...",
        accept: ".fbx",
      },
      { key: "emitEvents", type: "checkbox", label: "Emit Avatar Events" },
    ],
  },
  "emotion-analyzer": {
    label: "Emotion Analyzer",
    fields: [
      {
        key: "method",
        type: "select",
        label: "Analysis Method",
        options: [
          { label: "LLM-based (Recommended)", value: "llm" },
          { label: "Rule-based (Keywords)", value: "rule-based" },
        ],
      },
      {
        key: "expressions",
        type: "expression-list",
        label: "Available Expressions",
      },
      {
        key: "llmProvider",
        type: "select",
        label: "LLM Provider",
        options: [
          { label: "OpenAI", value: "openai" },
          { label: "Anthropic", value: "anthropic" },
          { label: "Google", value: "google" },
        ],
        showWhen: { key: "method", value: "llm" },
      },
      {
        key: "llmApiKey",
        type: "password",
        label: "LLM API Key",
        placeholder: "sk-...",
        showWhen: { key: "method", value: "llm" },
      },
      {
        key: "llmModel",
        type: "select",
        label: "LLM Model",
        options: [],
        dynamic: true,
        dependsOn: "llmProvider",
        showWhen: { key: "method", value: "llm" },
      },
      {
        key: "language",
        type: "select",
        label: "Language",
        options: [
          { label: "Japanese", value: "ja" },
          { label: "English", value: "en" },
          { label: "Auto-detect", value: "auto" },
        ],
        showWhen: { key: "method", value: "rule-based" },
      },
      {
        key: "customMappings",
        type: "textarea",
        label: "Custom Keyword Mappings (JSON)",
        placeholder: '{"happy": ["keyword1", "keyword2"]}',
        showWhen: { key: "method", value: "rule-based" },
      },
      { key: "emitEvents", type: "checkbox", label: "Emit Avatar Events" },
    ],
  },
  "lip-sync": {
    label: "Lip Sync",
    fields: [
      {
        key: "method",
        type: "select",
        label: "Lip Sync Method",
        options: [
          { label: "Volume-based (Simple)", value: "volume" },
          { label: "Envelope Following", value: "envelope" },
        ],
      },
      {
        key: "sensitivity",
        type: "number",
        label: "Sensitivity (1.0-10.0)",
        placeholder: "5.0",
      },
      {
        key: "smoothing",
        type: "number",
        label: "Smoothing (0.0-0.9)",
        placeholder: "0.3",
      },
      {
        key: "threshold",
        type: "number",
        label: "Threshold (0.0-0.2)",
        placeholder: "0.02",
      },
      { key: "emitRealtime", type: "checkbox", label: "Emit Realtime Events" },
      {
        key: "frameRate",
        type: "number",
        label: "Frame Rate",
        placeholder: "30",
      },
    ],
  },
  "avatar-display": {
    label: "Avatar Display",
    fields: [
      {
        key: "renderer",
        type: "select",
        label: "Renderer",
        options: [
          { label: "VRM (Built-in)", value: "vrm" },
          { label: "VTube Studio", value: "vtube-studio" },
          { label: "PNG Images", value: "png" },
        ],
      },
      {
        key: "modelUrl",
        type: "model-file",
        label: "VRM Model",
        placeholder: "Upload VRM model...",
        accept: ".vrm",
        showWhen: { key: "renderer", value: "vrm" },
      },
      {
        key: "animationUrl",
        type: "animation-file",
        label: "Idle Animation (FBX)",
        placeholder: "Upload Mixamo FBX...",
        accept: ".fbx",
        showWhen: { key: "renderer", value: "vrm" },
      },
      {
        key: "vtubePort",
        type: "number",
        label: "VTube Studio Port",
        placeholder: "8001",
        showWhen: { key: "renderer", value: "vtube-studio" },
      },
      {
        key: "pngConfig",
        type: "png-expression-map",
        label: "PNG Expression Mappings",
        showWhen: { key: "renderer", value: "png" },
      },
      {
        key: "auto_emotion",
        type: "checkbox",
        label: "Auto Emotion Detection",
      },
      { key: "auto_lipsync", type: "checkbox", label: "Auto Lip Sync" },
      { key: "show_subtitle", type: "checkbox", label: "Show Subtitle" },
      {
        key: "lipsync_sensitivity",
        type: "number",
        label: "Lip Sync Sensitivity (1.0-10.0)",
        placeholder: "5.0",
      },
      {
        key: "lipsync_smoothing",
        type: "number",
        label: "Lip Sync Smoothing (0.0-0.9)",
        placeholder: "0.3",
      },
      {
        key: "lipsync_threshold",
        type: "number",
        label: "Lip Sync Threshold (0.0-0.2)",
        placeholder: "0.02",
      },
      {
        key: "emotion_language",
        type: "select",
        label: "Emotion Detection Language",
        options: [
          { label: "Japanese", value: "ja" },
          { label: "English", value: "en" },
          { label: "Auto-detect", value: "auto" },
        ],
      },
    ],
  },
  "audio-player": {
    label: "Audio Player",
    fields: [
      {
        key: "volume",
        type: "number",
        label: "Volume (0.0-1.0)",
        placeholder: "1.0",
      },
      {
        key: "outputDevice",
        type: "select",
        label: "Output Device",
        options: [
          { label: "Browser (Overlay)", value: "browser" },
          { label: "Server", value: "server" },
        ],
      },
      {
        key: "waitForCompletion",
        type: "checkbox",
        label: "Wait for Completion",
      },
    ],
  },
  "subtitle-display": {
    label: "Subtitle Display",
    fields: [
      {
        key: "style",
        type: "select",
        label: "Style Preset",
        options: [
          { label: "Default", value: "default" },
          { label: "Gaming", value: "gaming" },
          { label: "Minimal", value: "minimal" },
          { label: "Custom", value: "custom" },
        ],
      },
      {
        key: "position",
        type: "select",
        label: "Position",
        options: [
          { label: "Bottom Center", value: "bottom-center" },
          { label: "Bottom Left", value: "bottom-left" },
          { label: "Top Center", value: "top-center" },
          { label: "Center", value: "center" },
        ],
      },
      {
        key: "fontSize",
        type: "number",
        label: "Font Size (px)",
        placeholder: "24",
      },
      {
        key: "fontColor",
        type: "text",
        label: "Font Color",
        placeholder: "#ffffff",
      },
      {
        key: "backgroundColor",
        type: "text",
        label: "Background Color",
        placeholder: "rgba(0, 0, 0, 0.7)",
      },
      { key: "showSpeaker", type: "checkbox", label: "Show Speaker Name" },
      {
        key: "animation",
        type: "select",
        label: "Animation",
        options: [
          { label: "None", value: "none" },
          { label: "Fade", value: "fade" },
          { label: "Typewriter", value: "typewriter" },
          { label: "Slide", value: "slide" },
        ],
      },
      {
        key: "duration",
        type: "number",
        label: "Display Duration (ms)",
        placeholder: "0 = until next",
      },
    ],
  },
  "data-formatter": {
    label: "Data Formatter",
    fields: [
      {
        key: "format",
        type: "select",
        label: "Output Format",
        options: [
          { label: "JSON", value: "json" },
          { label: "XML", value: "xml" },
          { label: "YAML", value: "yaml" },
        ],
      },
      {
        key: "template",
        type: "textarea",
        label: "Template",
        placeholder: '{"message": "{{text}}"}',
      },
      {
        key: "rootElement",
        type: "text",
        label: "XML Root Element",
        placeholder: "data",
      },
      { key: "prettyPrint", type: "checkbox", label: "Pretty Print" },
    ],
  },
  "donation-alert": {
    label: "Donation Alert",
    fields: [
      {
        key: "alertSound",
        type: "text",
        label: "Alert Sound URL",
        placeholder: "URL to sound file",
      },
      {
        key: "displayDuration",
        type: "number",
        label: "Display Duration (ms)",
        placeholder: "5000",
      },
      {
        key: "minAmount",
        type: "number",
        label: "Minimum Amount",
        placeholder: "0 = all",
      },
      {
        key: "template",
        type: "text",
        label: "Message Template",
        placeholder: "{author} donated {amount} {currency}!",
      },
      {
        key: "style",
        type: "select",
        label: "Alert Style",
        options: [
          { label: "Default", value: "default" },
          { label: "Minimal", value: "minimal" },
          { label: "Fancy", value: "fancy" },
        ],
      },
    ],
  },
  "obs-scene-switch": {
    label: "OBS Scene Switch",
    fields: [
      { key: "host", type: "text", label: "Host", placeholder: "localhost" },
      { key: "port", type: "number", label: "Port", placeholder: "4455" },
      {
        key: "password",
        type: "password",
        label: "Password",
        placeholder: "OBS WebSocket password",
      },
      {
        key: "sceneName",
        type: "text",
        label: "Scene Name",
        placeholder: "Target scene",
      },
    ],
  },
  "obs-source-toggle": {
    label: "OBS Source Toggle",
    fields: [
      { key: "host", type: "text", label: "Host", placeholder: "localhost" },
      { key: "port", type: "number", label: "Port", placeholder: "4455" },
      {
        key: "password",
        type: "password",
        label: "Password",
        placeholder: "OBS WebSocket password",
      },
      {
        key: "sceneName",
        type: "text",
        label: "Scene Name",
        placeholder: "Current scene if empty",
      },
      {
        key: "sourceName",
        type: "text",
        label: "Source Name",
        placeholder: "Source to toggle",
      },
      {
        key: "action",
        type: "select",
        label: "Action",
        options: [
          { label: "Toggle", value: "toggle" },
          { label: "Show", value: "show" },
          { label: "Hide", value: "hide" },
        ],
      },
    ],
  },
};

// Convert kebab-case/snake_case to camelCase for i18n key derivation
const toPluginCamel = (id: string) =>
  id.replace(/[-_]([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * Maps old snake_case config keys to new camelCase keys per node type. Used to
 * normalize legacy configs saved before the camelCase migration so they keep
 * rendering against the renamed fields in nodeConfigs.
 */
const LEGACY_KEY_MAP: Record<string, Record<string, string>> = {
  "avatar-configuration": {
    model_url: "modelUrl",
    idle_animation: "idleAnimation",
    vtube_port: "vtubePort",
    vtube_mouth_param: "vtubeMouthParam",
    vtube_expression_map: "vtubeExpressionMap",
    png_config: "pngConfig",
  },
  "motion-trigger": {
    motion_url: "motionUrl",
    emit_events: "emitEvents",
  },
  "emotion-analyzer": {
    llm_provider: "llmProvider",
    llm_api_key: "llmApiKey",
    llm_model: "llmModel",
    custom_mappings: "customMappings",
    emit_events: "emitEvents",
  },
  "lip-sync": {
    emit_realtime: "emitRealtime",
    frame_rate: "frameRate",
  },
  "audio-player": {
    output_device: "outputDevice",
    wait_for_completion: "waitForCompletion",
  },
  "subtitle-display": {
    font_size: "fontSize",
    font_color: "fontColor",
    background_color: "backgroundColor",
    show_speaker: "showSpeaker",
  },
  "obs-scene-switch": {
    scene_name: "sceneName",
  },
  "obs-source-toggle": {
    scene_name: "sceneName",
    source_name: "sourceName",
  },
};

/**
 * Normalize legacy snake_case config keys to camelCase. Any camelCase key that
 * already exists takes priority and the stale snake_case key is dropped.
 */
function normalizeLegacyConfig(
  nodeType: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const keyMap = LEGACY_KEY_MAP[nodeType];
  if (!keyMap) return config;

  const normalized = { ...config };
  for (const [oldKey, newKey] of Object.entries(keyMap)) {
    if (oldKey in normalized && !(newKey in normalized)) {
      normalized[newKey] = normalized[oldKey];
      delete normalized[oldKey];
    }
  }
  return normalized;
}

export default function NodeSettings() {
  const { selectedNodeId, nodes, updateNode, removeNode } = useWorkflowStore();
  const { t } = useTranslation();
  const { settings: globalSettingsValues, loaded: globalSettingsLoaded, fetchSettings: fetchGlobalSettings } = useSettingsStore();
  const [showOverrides, setShowOverrides] = useState(false);
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  const [voicevoxSpeakers, setVoicevoxSpeakers] = useState<VoicevoxSpeaker[]>(
    [],
  );
  const [voicevoxLoading, setVoicevoxLoading] = useState(false);
  const [voicevoxError, setVoicevoxError] = useState<string | null>(null);
  const [animations, setAnimations] = useState<AnimationInfo[]>([]);
  const [animationUploading, setAnimationUploading] = useState(false);
  const animationInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelUploading, setModelUploading] = useState(false);
  const modelInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [avatarImages] = useState<string[]>([]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Fetch global settings if not loaded
  useEffect(() => {
    if (!globalSettingsLoaded) fetchGlobalSettings();
  }, [globalSettingsLoaded, fetchGlobalSettings]);

  // Fetch animations list
  const fetchAnimations = useCallback(async () => {
    try {
      const response = await api.listAnimations();
      if (response.data) {
        setAnimations(response.data.animations);
      }
    } catch (err) {
      console.error("Failed to fetch animations:", err);
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
      console.error("Failed to fetch models:", err);
    }
  }, []);

  // Handle animation file upload
  const handleAnimationUpload = useCallback(
    async (file: File, fieldKey: string) => {
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
          toast.error(t('settings.uploadFailed') + response.error);
        }
      } catch {
        toast.error(t('settings.uploadAnimationFailed'));
      } finally {
        setAnimationUploading(false);
      }
    },
    [localConfig, selectedNode, updateNode, fetchAnimations],
  );

  // Handle model file upload
  const handleModelUpload = useCallback(
    async (file: File, fieldKey: string) => {
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
          toast.error(t('settings.uploadFailed') + response.error);
        }
      } catch {
        toast.error(t('settings.uploadModelFailed'));
      } finally {
        setModelUploading(false);
      }
    },
    [localConfig, selectedNode, updateNode, fetchModels],
  );

  // Handle avatar image upload (for PNG mode)
  const handleAvatarImageUpload = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const response = await api.uploadModel(file); // Reuse model upload endpoint for images
        if (response.data) {
          return response.data.url;
        } else if (response.error) {
          toast.error(t('settings.uploadFailed') + response.error);
        }
      } catch {
        toast.error(t('settings.uploadImageFailed'));
      }
      return null;
    },
    [],
  );

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
    } catch {
      setVoicevoxError("Failed to fetch speakers");
      setVoicevoxSpeakers([]);
    } finally {
      setVoicevoxLoading(false);
    }
  }, []);

  const { getPluginById, isLoaded: isPluginsLoaded } = usePluginStore();

  useEffect(() => {
    if (selectedNode) {
      setLocalConfig(normalizeLegacyConfig(selectedNode.type, selectedNode.config || {}));
      setShowOverrides(false);

      // Fetch VOICEVOX speakers if this is a voicevox-tts node
      if (selectedNode.type === "voicevox-tts") {
        const host =
          (selectedNode.config?.host as string) || "http://localhost:50021";
        fetchVoicevoxSpeakers(host);
      }

      // Fetch animations/models based on manifest config or nodeConfigs field types
      const pluginConfig = getPluginById(selectedNode.type)?.config;
      const fallbackFields = nodeConfigs[selectedNode.type]?.fields;
      const hasAnimationField = pluginConfig
        ? Object.values(pluginConfig).some((f) => f.type === "animation-file")
        : fallbackFields?.some((f) => f.type === "animation-file");
      const hasModelField = pluginConfig
        ? Object.values(pluginConfig).some((f) => f.type === "model-file")
        : fallbackFields?.some((f) => f.type === "model-file");
      if (hasAnimationField) fetchAnimations();
      if (hasModelField) fetchModels();
    }
  }, [selectedNode, fetchVoicevoxSpeakers, fetchAnimations, fetchModels, getPluginById, isPluginsLoaded]);

  // Dynamic schema resolution: plugin store first, nodeConfigs fallback
  const plugin = getPluginById(selectedNode?.type ?? "");
  const fields: NodeField[] = useMemo(() => {
    if (!selectedNode) return [];
    const manifestFields = plugin?.config
      ? manifestConfigToNodeFields(plugin.config)
      : [];
    return manifestFields.length > 0
      ? manifestFields
      : nodeConfigs[selectedNode.type]?.fields ?? [];
  }, [selectedNode, plugin]);

  // Split fields into overridable (have global setting) and normal
  // Classification is based on global mapping existence, not local config value,
  // so typing into an override field doesn't move it between lists.
  const { normalFields, overridableFields } = useMemo(() => {
    if (!selectedNode) return { normalFields: [], overridableFields: [] };
    const globalMapping = GLOBAL_SETTINGS_MAP[selectedNode.type];
    const normal: NodeField[] = [];
    const overridable: NodeField[] = [];

    for (const field of fields) {
      if (!evaluateShowWhen(field.showWhen, localConfig)) continue;
      const globalKey = globalMapping?.[field.key];
      const globalValue = globalKey ? globalSettingsValues[globalKey] : undefined;
      if (globalKey && globalValue) {
        overridable.push(field);
      } else {
        normal.push(field);
      }
    }
    return { normalFields: normal, overridableFields: overridable };
  }, [fields, localConfig, globalSettingsValues, selectedNode]);

  if (!selectedNode) {
    return null;
  }

  const handleChange = (key: string, value: unknown) => {
    const newConfig = { ...localConfig, [key]: value };

    // Reset llmModel when llmProvider changes
    if (key === "llmProvider") {
      newConfig.llmModel = "";
    }

    setLocalConfig(newConfig);
    updateNode(selectedNode.id, { config: newConfig });

    // Refetch speakers when host changes for voicevox-tts
    if (selectedNode.type === "voicevox-tts" && key === "host") {
      fetchVoicevoxSpeakers(value as string);
    }
  };

  const handleDelete = () => {
    removeNode(selectedNode.id);
    toast.info(t('settings.nodeDeleted'));
  };

  const renderField = (field: NodeField) => {
    const value = field.key in localConfig ? localConfig[field.key] : undefined;

    const inputStyle = {
      width: "100%",
      padding: "8px",
      borderRadius: "6px",
      border: "1px solid rgba(255,255,255,0.2)",
      background: "rgba(0,0,0,0.3)",
      color: "#fff",
      fontSize: "12px",
      outline: "none",
    };

    switch (field.type) {
      case "text":
        return (
          <input
            type="text"
            value={(value ?? field.defaultValue ?? "") as string}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            style={inputStyle}
          />
        );

      case "number":
        return (
          <input
            type="number"
            value={(value ?? field.defaultValue ?? "") as number}
            onChange={(e) =>
              handleChange(field.key, e.target.value === "" ? undefined : parseFloat(e.target.value))
            }
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            required={field.required}
            style={inputStyle}
          />
        );

      case "textarea":
        return (
          <textarea
            value={(value ?? field.defaultValue ?? "") as string}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            style={{ ...inputStyle, resize: "vertical", minHeight: "60px" }}
          />
        );

      case "select":
        // Handle dynamic LLM model select (e.g., emotion-analyzer llmModel field)
        if (field.dynamic && field.dependsOn && (field.key === "model" || field.key === "llmModel")) {
          const dependsOnValue = localConfig[field.dependsOn] as string;
          // Try plugin store first: provider "openai" → plugin "openai-llm"
          const providerPluginId = `${dependsOnValue}-llm`;
          const providerPlugin = getPluginById(providerPluginId);
          const dynamicModelOptions = normalizeOptions(providerPlugin?.config?.model?.options);
          // Fall back to hardcoded LLM_MODEL_OPTIONS
          const modelOptions: { label: string; value: string | number }[] =
            dynamicModelOptions && dynamicModelOptions.length > 0
              ? dynamicModelOptions
              : LLM_MODEL_OPTIONS[dependsOnValue] || [];

          if (modelOptions.length > 0) {
            return (
              <select
                value={(value ?? field.defaultValue ?? "") as string}
                onChange={(e) => handleChange(field.key, e.target.value)}
                style={inputStyle}
              >
                <option value="">Select a model...</option>
                {modelOptions.map((opt) => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            );
          }
        }

        // Handle dynamic VOICEVOX speaker options
        if (
          field.dynamic &&
          field.key === "speaker" &&
          selectedNode.type === "voicevox-tts"
        ) {
          if (voicevoxLoading) {
            return (
              <div style={{ ...inputStyle, color: "rgba(255,255,255,0.5)" }}>
                Loading speakers...
              </div>
            );
          }
          if (voicevoxError) {
            return (
              <div>
                <div
                  style={{
                    ...inputStyle,
                    color: "#f87171",
                    marginBottom: "4px",
                  }}
                >
                  {voicevoxError}
                </div>
                <button
                  onClick={() =>
                    fetchVoicevoxSpeakers(
                      (localConfig.host as string) || "http://localhost:50021",
                    )
                  }
                  style={{
                    ...inputStyle,
                    cursor: "pointer",
                    textAlign: "center",
                    background: "rgba(16, 185, 129, 0.2)",
                    border: "1px solid rgba(16, 185, 129, 0.5)",
                  }}
                >
                  Retry
                </button>
              </div>
            );
          }
          return (
            <select
              value={(value ?? field.defaultValue ?? "") as string}
              onChange={(e) =>
                handleChange(field.key, parseInt(e.target.value, 10))
              }
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
            value={(value ?? field.defaultValue ?? "") as string}
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

      case "checkbox":
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(value ?? field.defaultValue ?? false) as boolean}
              onChange={(e) => handleChange(field.key, e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/30 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-white/70 text-xs">
              {field.placeholder || "Enabled"}
            </span>
          </label>
        );

      case "animation-file":
        return (
          <div className="space-y-2">
            {/* Current value display */}
            {typeof value === "string" && value && (
              <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10 border border-emerald-500/30">
                <span className="text-xs text-emerald-400 truncate flex-1">
                  {(value as string).split("/").pop()}
                </span>
                <button
                  onClick={() => handleChange(field.key, "")}
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
                ref={(el) => { animationInputRefs.current[field.key] = el; }}
                accept={field.accept || ".fbx"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleAnimationUpload(file, field.key);
                  }
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                onClick={() => animationInputRefs.current[field.key]?.click()}
                disabled={animationUploading}
                style={{
                  ...inputStyle,
                  cursor: animationUploading ? "wait" : "pointer",
                  textAlign: "center",
                  background: animationUploading
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(59, 130, 246, 0.2)",
                  border: "1px solid rgba(59, 130, 246, 0.5)",
                }}
              >
                {animationUploading ? "Uploading..." : "Upload FBX"}
              </button>
            </div>

            {/* Existing animations dropdown */}
            {animations.length > 0 && (
              <select
                value={(value ?? field.defaultValue ?? "") as string}
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
              Download idle animations from{" "}
              <a
                href="https://www.mixamo.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                Mixamo
              </a>{" "}
              (FBX format, Without Skin)
            </div>
          </div>
        );

      case "model-file":
        return (
          <div className="space-y-2">
            {/* Current value display */}
            {typeof value === "string" && value && (
              <div className="flex items-center justify-between p-2 rounded bg-purple-500/10 border border-purple-500/30">
                <span className="text-xs text-purple-400 truncate flex-1">
                  {(value as string).split("/").pop()}
                </span>
                <button
                  onClick={() => handleChange(field.key, "")}
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
                ref={(el) => { modelInputRefs.current[field.key] = el; }}
                accept={field.accept || ".vrm"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleModelUpload(file, field.key);
                  }
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                onClick={() => modelInputRefs.current[field.key]?.click()}
                disabled={modelUploading}
                style={{
                  ...inputStyle,
                  cursor: modelUploading ? "wait" : "pointer",
                  textAlign: "center",
                  background: modelUploading
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(168, 85, 247, 0.2)",
                  border: "1px solid rgba(168, 85, 247, 0.5)",
                }}
              >
                {modelUploading ? "Uploading..." : "Upload VRM"}
              </button>
            </div>

            {/* Existing models dropdown */}
            {models.length > 0 && (
              <select
                value={(value ?? field.defaultValue ?? "") as string}
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

      case "prompt-builder": {
        const sections = (value as PromptSection[]) || [];

        const addSection = (type: "text" | "input") => {
          const newSection: PromptSection = {
            id: `section-${Date.now()}`,
            type,
            content:
              type === "text"
                ? ""
                : `input_${sections.filter((s) => s.type === "input").length + 1}`,
          };
          handleChange(field.key, [...sections, newSection]);
        };

        const updateSection = (id: string, content: string) => {
          const updated = sections.map((s) =>
            s.id === id ? { ...s, content } : s,
          );
          handleChange(field.key, updated);
        };

        const removeSection = (id: string) => {
          handleChange(
            field.key,
            sections.filter((s) => s.id !== id),
          );
        };

        const moveSection = (index: number, direction: "up" | "down") => {
          const newIndex = direction === "up" ? index - 1 : index + 1;
          if (newIndex < 0 || newIndex >= sections.length) return;
          const newSections = [...sections];
          [newSections[index], newSections[newIndex]] = [
            newSections[newIndex],
            newSections[index],
          ];
          handleChange(field.key, newSections);
        };

        return (
          <div className="space-y-2">
            {/* Existing sections */}
            {sections.map((section, index) => (
              <div key={section.id} className="relative">
                {section.type === "text" ? (
                  <div className="border border-white/20 rounded-md overflow-hidden">
                    <div className="flex items-center justify-between px-2 py-1 bg-emerald-500/20 text-[10px] text-emerald-400">
                      <span>Text Block</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveSection(index, "up")}
                          disabled={index === 0}
                          className="px-1 hover:bg-white/10 rounded disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveSection(index, "down")}
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
                      onChange={(e) =>
                        updateSection(section.id, e.target.value)
                      }
                      placeholder={t('settings.staticTextPlaceholder')}
                      rows={2}
                      style={{
                        width: "100%",
                        padding: "8px",
                        border: "none",
                        background: "rgba(0,0,0,0.3)",
                        color: "#fff",
                        fontSize: "11px",
                        resize: "vertical",
                        minHeight: "40px",
                        outline: "none",
                      }}
                    />
                  </div>
                ) : (
                  <div className="border border-blue-500/30 rounded-md overflow-hidden">
                    <div className="flex items-center justify-between px-2 py-1 bg-blue-500/20 text-[10px] text-blue-400">
                      <span>Input Port (Dynamic)</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveSection(index, "up")}
                          disabled={index === 0}
                          className="px-1 hover:bg-white/10 rounded disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveSection(index, "down")}
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
                        onChange={(e) =>
                          updateSection(
                            section.id,
                            e.target.value.replace(/\s/g, "_"),
                          )
                        }
                        placeholder="input_name"
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                          background: "rgba(59, 130, 246, 0.1)",
                          color: "#93c5fd",
                          fontSize: "11px",
                          outline: "none",
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
                onClick={() => addSection("text")}
                className="flex-1 py-2 rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[11px] cursor-pointer transition-colors hover:bg-emerald-500/20"
              >
                + Text Block
              </button>
              <button
                onClick={() => addSection("input")}
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

      case "input-list":
        return (
          <InputListField
            value={(value as string[]) || []}
            onChange={(newValue) => handleChange(field.key, newValue)}
            placeholder={field.placeholder}
          />
        );

      case "expression-list":
        return (
          <ExpressionListField
            value={(value as Expression[]) || []}
            onChange={(newValue) => handleChange(field.key, newValue)}
          />
        );

      case "password":
        return (
          <PasswordField
            value={(value ?? field.defaultValue ?? "") as string}
            onChange={(newValue) => handleChange(field.key, newValue)}
            placeholder={field.placeholder}
            style={inputStyle}
          />
        );

      case "png-expression-map": {
        // Parse existing JSON config or use default
        let pngConfig: PngConfig;
        if (typeof value === "string") {
          try {
            pngConfig = JSON.parse(value);
          } catch {
            pngConfig = { baseUrl: "/images/avatar/", expressions: {} };
          }
        } else if (value && typeof value === "object") {
          pngConfig = value as PngConfig;
        } else {
          pngConfig = { baseUrl: "/images/avatar/", expressions: {} };
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
    // Auto-derive i18n key from node type
    const derivedKey = `nodeConfig.${toPluginCamel(nodeType)}.label`;
    const derived = t(derivedKey);
    if (derived !== derivedKey) return derived;

    // Fall back to plugin store label, then nodeConfigs, then raw type
    const p = getPluginById(nodeType);
    return p?.ui?.label ?? p?.name ?? nodeConfigs[nodeType]?.label ?? nodeType;
  };

  // Helper to get translated label for a field
  const getFieldLabel = (
    nodeType: string,
    fieldKey: string,
    fallbackLabel: string,
  ): string => {
    const nodePrefix = toPluginCamel(nodeType);
    const fieldKeyCamel = toPluginCamel(fieldKey);
    const translationKey = `nodeConfig.${nodePrefix}.${fieldKeyCamel}`;
    const translated = t(translationKey);

    // If translation returns the key itself, fall back to the original label
    return translated !== translationKey ? translated : fallbackLabel;
  };

  return (
    <div className="p-4 flex-1 overflow-auto">
      <h3 className="text-xs text-white/50 uppercase tracking-wider mb-3 m-0">
        {t("settings.nodeSettings")}
      </h3>
      <div className="p-3 rounded-lg" style={{ background: "rgba(0,0,0,0.3)" }}>
        {/* Node Type */}
        <div className="mb-3">
          <label className="block text-[11px] text-white/60 mb-1">
            {t("nodeConfig.nodeType")}
          </label>
          <div className="text-white font-medium text-sm">
            {getNodeLabel(selectedNode.type)}
          </div>
        </div>

        {/* Config Fields */}
        {normalFields.map((field) => (
          <div key={field.key} className="mb-3">
            <label className="block text-[11px] text-white/60 mb-1">
              {getFieldLabel(selectedNode.type, field.key, field.label)}
            </label>
            {renderField(field)}
          </div>
        ))}

        {/* Global settings banner (collapsed) */}
        {overridableFields.length > 0 && !showOverrides && (
          <div className="mb-3 p-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-center gap-2 text-[11px] text-emerald-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>{t("globalSettings.usingGlobal")}</span>
            </div>
            <button
              onClick={() => setShowOverrides(true)}
              className="mt-1.5 text-[10px] text-white/40 hover:text-white/60 transition-colors"
            >
              {t("globalSettings.override")}
            </button>
          </div>
        )}

        {/* Overridable fields (expanded) */}
        {showOverrides && overridableFields.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-white/40">{t("globalSettings.override")}</span>
              <button
                onClick={() => setShowOverrides(false)}
                className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
              >
                {t("globalSettings.collapse")}
              </button>
            </div>
            {overridableFields.map((field) => (
              <div key={field.key} className="mb-3">
                <label className="block text-[11px] text-white/60 mb-1">
                  {getFieldLabel(selectedNode.type, field.key, field.label)}
                  <span className="ml-1 text-emerald-400 text-[10px]">
                    ({t("globalSettings.usingGlobal")})
                  </span>
                </label>
                {renderField(field)}
              </div>
            ))}
          </div>
        )}

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          className="w-full mt-2 py-2 rounded-md border border-red-500/50 bg-red-500/10 text-red-400 text-xs cursor-pointer transition-colors hover:bg-red-500/20"
        >
          {t("nodeConfig.deleteNode")}
        </button>
      </div>
    </div>
  );
}
