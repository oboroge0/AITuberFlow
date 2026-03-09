"use client";

import React, { useState, useRef } from "react";
import { usePluginStore } from "@/stores/pluginStore";
import { normalizeOptions } from "@/lib/configUtils";
import { LLM_MODEL_OPTIONS } from "@/lib/constants";
import type { VoicevoxSpeaker, AnimationInfo, ModelInfo } from "@/lib/api";
import type { NodeField } from "@/lib/types";

// Prompt section for structured prompt building
export interface PromptSection {
  id: string;
  type: "text" | "input";
  content: string; // For text: the actual text, For input: the input port name
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

// --- Separate component for password field with show/hide toggle ---

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
        aria-label={showPassword ? "Hide password" : "Show password"}
        aria-pressed={showPassword}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors"
        title={showPassword ? "Hide password" : "Show password"}
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

// --- Separate component for input-list field to properly use hooks ---

interface InputListFieldProps {
  value: string[];
  onChange: (newValue: string[]) => void;
  placeholder?: string;
}

function InputListField({ value, onChange, placeholder }: InputListFieldProps) {
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

// --- Separate component for expression-list field ---

interface ExpressionListFieldProps {
  value: Expression[];
  onChange: (newValue: Expression[]) => void;
}

function ExpressionListField({ value, onChange }: ExpressionListFieldProps) {
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
                  placeholder="Description for LLM (e.g., 'Self-satisfied, proud, confident')"
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
            placeholder="ID (e.g., smug)"
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
        Expressions define emotions the LLM can detect. The ID must match your
        avatar&apos;s expression/image names.
      </div>
    </div>
  );
}

// --- PNG Expression mapping types ---

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
  availableImages,
}: PngExpressionMapFieldProps) {
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
            placeholder="Expression ID (e.g., smug)"
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

// --- Main FormFieldRenderer component ---

export interface FormFieldRendererProps {
  field: NodeField;
  value: unknown;
  localConfig: Record<string, unknown>;
  selectedNodeType: string;
  handleChange: (key: string, value: unknown) => void;
  // VOICEVOX-specific
  voicevoxSpeakers: VoicevoxSpeaker[];
  voicevoxLoading: boolean;
  voicevoxError: string | null;
  fetchVoicevoxSpeakers: (host: string) => void;
  // Animation-specific
  animations: AnimationInfo[];
  animationUploading: boolean;
  animationInputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  handleAnimationUpload: (file: File, fieldKey: string) => void;
  // Model-specific
  models: ModelInfo[];
  modelUploading: boolean;
  modelInputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  handleModelUpload: (file: File, fieldKey: string) => void;
  // Avatar image upload (PNG mode)
  handleAvatarImageUpload: (file: File) => Promise<string | null>;
  avatarImages: string[];
}

export default function FormFieldRenderer({
  field,
  value,
  localConfig,
  selectedNodeType,
  handleChange,
  voicevoxSpeakers,
  voicevoxLoading,
  voicevoxError,
  fetchVoicevoxSpeakers,
  animations,
  animationUploading,
  animationInputRefs,
  handleAnimationUpload,
  models,
  modelUploading,
  modelInputRefs,
  handleModelUpload,
  handleAvatarImageUpload,
  avatarImages,
}: FormFieldRendererProps) {
  const { getPluginById } = usePluginStore();

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

    case "select": {
      // Handle dynamic LLM model select (e.g., emotion-analyzer llm_model field)
      if (field.dynamic && field.dependsOn && (field.key === "model" || field.key === "llm_model")) {
        const dependsOnValue = localConfig[field.dependsOn] as string;
        // Try plugin store first: provider "openai" -> plugin "openai-llm"
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
        selectedNodeType === "voicevox-tts"
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
    }

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
                    placeholder="Enter static text for this part of the prompt..."
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
}
