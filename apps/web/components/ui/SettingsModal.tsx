'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/stores/localeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { LLM_MODEL_OPTIONS } from '@/lib/constants';

interface SettingsModalProps {
  onClose: () => void;
}

// Password field with show/hide toggle
function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 pr-9 rounded-lg text-sm text-white outline-none"
        style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.2)',
        }}
      />
      <button
        type="button"
        onClick={() => setShow((p) => !p)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors"
        aria-label={show ? 'Hide' : 'Show'}
      >
        {show ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

// Model select dropdown
function ModelSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.2)',
      }}
    >
      <option value="">---</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// Text input
function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.2)',
      }}
    />
  );
}

// Model lists from shared constants
const OPENAI_MODELS = LLM_MODEL_OPTIONS.openai;
const ANTHROPIC_MODELS = LLM_MODEL_OPTIONS.anthropic;
const GOOGLE_MODELS = LLM_MODEL_OPTIONS.google;

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { t } = useTranslation();
  const { settings, fetchSettings, updateSettings, loaded } = useSettingsStore();
  const [local, setLocal] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loaded) {
      fetchSettings();
    }
  }, [loaded, fetchSettings]);

  useEffect(() => {
    setLocal({ ...settings });
  }, [settings]);

  // Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const set = useCallback((key: string, value: string) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const ok = await updateSettings(local);
    setSaving(false);
    if (ok) {
      toast.success(t('globalSettings.saved'));
    } else {
      toast.error(t('globalSettings.saveError'));
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-white/10 overflow-hidden max-h-[85vh] flex flex-col"
        style={{
          background: 'rgba(17, 24, 39, 0.98)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{
            background: 'rgba(255,255,255,0.05)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(16, 185, 129, 0.2)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{t('globalSettings.title')}</h2>
              <p className="text-xs text-white/50">{t('globalSettings.description')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-6">
          {/* LLM Providers */}
          <section>
            <h3 className="text-sm font-semibold text-white/80 mb-3">{t('globalSettings.llmProviders')}</h3>

            {/* OpenAI */}
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <h4 className="text-xs font-medium text-white/60 mb-2">OpenAI</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] text-white/50 mb-1">{t('globalSettings.apiKey')}</label>
                  <PasswordInput
                    value={local['openai.apiKey'] || ''}
                    onChange={(v) => set('openai.apiKey', v)}
                    placeholder="sk-..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-white/50 mb-1">{t('globalSettings.model')}</label>
                  <ModelSelect
                    value={local['openai.model'] || ''}
                    onChange={(v) => set('openai.model', v)}
                    options={OPENAI_MODELS}
                  />
                </div>
              </div>
            </div>

            {/* Anthropic */}
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <h4 className="text-xs font-medium text-white/60 mb-2">Anthropic</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] text-white/50 mb-1">{t('globalSettings.apiKey')}</label>
                  <PasswordInput
                    value={local['anthropic.apiKey'] || ''}
                    onChange={(v) => set('anthropic.apiKey', v)}
                    placeholder="sk-ant-..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-white/50 mb-1">{t('globalSettings.model')}</label>
                  <ModelSelect
                    value={local['anthropic.model'] || ''}
                    onChange={(v) => set('anthropic.model', v)}
                    options={ANTHROPIC_MODELS}
                  />
                </div>
              </div>
            </div>

            {/* Google */}
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <h4 className="text-xs font-medium text-white/60 mb-2">Google</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] text-white/50 mb-1">{t('globalSettings.apiKey')}</label>
                  <PasswordInput
                    value={local['google.apiKey'] || ''}
                    onChange={(v) => set('google.apiKey', v)}
                    placeholder="AI..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-white/50 mb-1">{t('globalSettings.model')}</label>
                  <ModelSelect
                    value={local['google.model'] || ''}
                    onChange={(v) => set('google.model', v)}
                    options={GOOGLE_MODELS}
                  />
                </div>
              </div>
            </div>

            {/* Ollama */}
            <div className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <h4 className="text-xs font-medium text-white/60 mb-2">Ollama</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] text-white/50 mb-1">{t('globalSettings.host')}</label>
                  <TextInput
                    value={local['ollama.host'] || ''}
                    onChange={(v) => set('ollama.host', v)}
                    placeholder="http://localhost:11434"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-white/50 mb-1">{t('globalSettings.model')}</label>
                  <TextInput
                    value={local['ollama.model'] || ''}
                    onChange={(v) => set('ollama.model', v)}
                    placeholder="llama3.2, mistral..."
                  />
                </div>
              </div>
            </div>
          </section>

          {/* TTS Engines */}
          <section>
            <h3 className="text-sm font-semibold text-white/80 mb-3">{t('globalSettings.ttsEngines')}</h3>

            {/* VOICEVOX */}
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <h4 className="text-xs font-medium text-white/60 mb-2">VOICEVOX</h4>
              <div>
                <label className="block text-[11px] text-white/50 mb-1">{t('globalSettings.host')}</label>
                <TextInput
                  value={local['voicevox.host'] || ''}
                  onChange={(v) => set('voicevox.host', v)}
                  placeholder="http://localhost:50021"
                />
              </div>
            </div>

            {/* COEIROINK */}
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <h4 className="text-xs font-medium text-white/60 mb-2">COEIROINK</h4>
              <div>
                <label className="block text-[11px] text-white/50 mb-1">{t('globalSettings.host')}</label>
                <TextInput
                  value={local['coeiroink.host'] || ''}
                  onChange={(v) => set('coeiroink.host', v)}
                  placeholder="http://localhost:50032"
                />
              </div>
            </div>

            {/* SBV2 */}
            <div className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <h4 className="text-xs font-medium text-white/60 mb-2">Style-Bert-VITS2</h4>
              <div>
                <label className="block text-[11px] text-white/50 mb-1">{t('globalSettings.host')}</label>
                <TextInput
                  value={local['sbv2.host'] || ''}
                  onChange={(v) => set('sbv2.host', v)}
                  placeholder="http://localhost:5000"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex items-center justify-end gap-3 flex-shrink-0"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-white/60 text-sm hover:bg-white/10 transition-colors"
          >
            {t('update.close')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-white font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            {saving ? '...' : t('globalSettings.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
