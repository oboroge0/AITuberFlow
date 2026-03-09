"use client";

import React from "react";
import { useTranslation } from "@/stores/localeStore";
import type { NodeField } from "@/lib/types";

// Global settings field mapping (mirrors server-side GLOBAL_SETTINGS_MAP)
export const GLOBAL_SETTINGS_MAP: Record<string, Record<string, string>> = {
  "openai-llm": { apiKey: "openai.apiKey", model: "openai.model" },
  "anthropic-llm": { apiKey: "anthropic.apiKey", model: "anthropic.model" },
  "google-llm": { apiKey: "google.apiKey", model: "google.model" },
  "ollama-llm": { host: "ollama.host", model: "ollama.model" },
  "groq-llm": { apiKey: "groq.apiKey", model: "groq.model" },
  "mistral-llm": { apiKey: "mistral.apiKey", model: "mistral.model" },
  "voicevox-tts": { host: "voicevox.host" },
  "coeiroink-tts": { host: "coeiroink.host" },
  "sbv2-tts": { host: "sbv2.host" },
  "aivis-tts": { host: "aivis.host" },
  "openai-tts": { apiKey: "openai.apiKey" },
};

interface GlobalSettingsBannerProps {
  showOverrides: boolean;
  setShowOverrides: (show: boolean) => void;
  overridableFields: NodeField[];
}

export function GlobalSettingsBanner({
  showOverrides,
  setShowOverrides,
  overridableFields,
}: GlobalSettingsBannerProps) {
  const { t } = useTranslation();

  if (overridableFields.length === 0 || showOverrides) return null;

  return (
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
  );
}

interface GlobalSettingsOverrideFieldsProps {
  showOverrides: boolean;
  setShowOverrides: (show: boolean) => void;
  overridableFields: NodeField[];
  selectedNodeType: string;
  getFieldLabel: (nodeType: string, fieldKey: string, fallbackLabel: string) => string;
  renderField: (field: NodeField) => React.ReactNode;
}

export function GlobalSettingsOverrideFields({
  showOverrides,
  setShowOverrides,
  overridableFields,
  selectedNodeType,
  getFieldLabel,
  renderField,
}: GlobalSettingsOverrideFieldsProps) {
  const { t } = useTranslation();

  if (!showOverrides || overridableFields.length === 0) return null;

  return (
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
            {getFieldLabel(selectedNodeType, field.key, field.label)}
            <span className="ml-1 text-emerald-400 text-[10px]">
              ({t("globalSettings.usingGlobal")})
            </span>
          </label>
          {renderField(field)}
        </div>
      ))}
    </div>
  );
}
