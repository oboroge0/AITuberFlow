"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useWorkflowStore } from "@/stores/workflowStore";
import { useTranslation } from "@/stores/localeStore";
import { usePluginStore } from "@/stores/pluginStore";
import api, { VoicevoxSpeaker, AnimationInfo, ModelInfo } from "@/lib/api";
import { manifestConfigToNodeFields, evaluateShowWhen } from "@/lib/configUtils";
import { useSettingsStore } from "@/stores/settingsStore";
import { LLM_MODEL_OPTIONS } from "@/lib/constants";
import type { NodeField } from "@/lib/types";
import FormFieldRenderer from "./FormFieldRenderer";
import { GLOBAL_SETTINGS_MAP, GlobalSettingsBanner, GlobalSettingsOverrideFields } from "./GlobalSettingsOverride";

// Re-export types that are used by external consumers
export type { PromptSection } from "./FormFieldRenderer";
export type { Expression } from "./FormFieldRenderer";

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
        key: "model_url",
        type: "model-file",
        label: "VRM Model",
        placeholder: "Upload VRM model...",
        accept: ".vrm",
        showWhen: { key: "renderer", value: "vrm" },
      },
      {
        key: "idle_animation",
        type: "animation-file",
        label: "Idle Animation (FBX)",
        placeholder: "Upload Mixamo FBX...",
        accept: ".fbx",
        showWhen: { key: "renderer", value: "vrm" },
      },
      // VTube Studio settings
      {
        key: "vtube_port",
        type: "number",
        label: "VTube Studio Port",
        placeholder: "8001",
        showWhen: { key: "renderer", value: "vtube-studio" },
      },
      // PNG settings
      {
        key: "png_config",
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
        key: "motion_url",
        type: "animation-file",
        label: "Motion Animation (FBX)",
        placeholder: "Upload Mixamo FBX...",
        accept: ".fbx",
      },
      { key: "emit_events", type: "checkbox", label: "Emit Avatar Events" },
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
        key: "llm_provider",
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
        key: "llm_api_key",
        type: "password",
        label: "LLM API Key",
        placeholder: "sk-...",
        showWhen: { key: "method", value: "llm" },
      },
      {
        key: "llm_model",
        type: "select",
        label: "LLM Model",
        options: [],
        dynamic: true,
        dependsOn: "llm_provider",
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
        key: "custom_mappings",
        type: "textarea",
        label: "Custom Keyword Mappings (JSON)",
        placeholder: '{"happy": ["keyword1", "keyword2"]}',
        showWhen: { key: "method", value: "rule-based" },
      },
      { key: "emit_events", type: "checkbox", label: "Emit Avatar Events" },
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
      { key: "emit_realtime", type: "checkbox", label: "Emit Realtime Events" },
      {
        key: "frame_rate",
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
        key: "model_url",
        type: "model-file",
        label: "VRM Model",
        placeholder: "Upload VRM model...",
        accept: ".vrm",
        showWhen: { key: "renderer", value: "vrm" },
      },
      {
        key: "animation_url",
        type: "animation-file",
        label: "Idle Animation (FBX)",
        placeholder: "Upload Mixamo FBX...",
        accept: ".fbx",
        showWhen: { key: "renderer", value: "vrm" },
      },
      {
        key: "vtube_port",
        type: "number",
        label: "VTube Studio Port",
        placeholder: "8001",
        showWhen: { key: "renderer", value: "vtube-studio" },
      },
      {
        key: "png_config",
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
        key: "output_device",
        type: "select",
        label: "Output Device",
        options: [
          { label: "Browser (Overlay)", value: "browser" },
          { label: "Server", value: "server" },
        ],
      },
      {
        key: "wait_for_completion",
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
        key: "font_size",
        type: "number",
        label: "Font Size (px)",
        placeholder: "24",
      },
      {
        key: "font_color",
        type: "text",
        label: "Font Color",
        placeholder: "#ffffff",
      },
      {
        key: "background_color",
        type: "text",
        label: "Background Color",
        placeholder: "rgba(0, 0, 0, 0.7)",
      },
      { key: "show_speaker", type: "checkbox", label: "Show Speaker Name" },
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
        key: "scene_name",
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
        key: "scene_name",
        type: "text",
        label: "Scene Name",
        placeholder: "Current scene if empty",
      },
      {
        key: "source_name",
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
  const [avatarImages, setAvatarImages] = useState<string[]>([]);

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
          alert(`Upload failed: ${response.error}`);
        }
      } catch (err) {
        alert("Failed to upload animation file");
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
          alert(`Upload failed: ${response.error}`);
        }
      } catch (err) {
        alert("Failed to upload model file");
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
          alert(`Upload failed: ${response.error}`);
        }
      } catch (err) {
        alert("Failed to upload image");
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
    } catch (err) {
      setVoicevoxError("Failed to fetch speakers");
      setVoicevoxSpeakers([]);
    } finally {
      setVoicevoxLoading(false);
    }
  }, []);

  const { getPluginById, isLoaded: isPluginsLoaded } = usePluginStore();

  useEffect(() => {
    if (selectedNode) {
      setLocalConfig(selectedNode.config || {});
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
  const manifestFields = plugin?.config
    ? manifestConfigToNodeFields(plugin.config)
    : [];
  const fields: NodeField[] = useMemo(() => {
    if (!selectedNode) return [];
    return manifestFields.length > 0
      ? manifestFields
      : nodeConfigs[selectedNode.type]?.fields ?? [];
  }, [selectedNode, manifestFields]);

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

    // Reset llm_model when llm_provider changes
    if (key === "llm_provider") {
      newConfig.llm_model = "";
    }

    setLocalConfig(newConfig);
    updateNode(selectedNode.id, { config: newConfig });

    // Refetch speakers when host changes for voicevox-tts
    if (selectedNode.type === "voicevox-tts" && key === "host") {
      fetchVoicevoxSpeakers(value as string);
    }
  };

  const handleDelete = () => {
    if (confirm("Delete this node?")) {
      removeNode(selectedNode.id);
    }
  };

  const renderField = (field: NodeField) => {
    const value = field.key in localConfig ? localConfig[field.key] : undefined;

    return (
      <FormFieldRenderer
        field={field}
        value={value}
        localConfig={localConfig}
        selectedNodeType={selectedNode.type}
        handleChange={handleChange}
        voicevoxSpeakers={voicevoxSpeakers}
        voicevoxLoading={voicevoxLoading}
        voicevoxError={voicevoxError}
        fetchVoicevoxSpeakers={fetchVoicevoxSpeakers}
        animations={animations}
        animationUploading={animationUploading}
        animationInputRefs={animationInputRefs}
        handleAnimationUpload={handleAnimationUpload}
        models={models}
        modelUploading={modelUploading}
        modelInputRefs={modelInputRefs}
        handleModelUpload={handleModelUpload}
        handleAvatarImageUpload={handleAvatarImageUpload}
        avatarImages={avatarImages}
      />
    );
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
        <GlobalSettingsBanner
          showOverrides={showOverrides}
          setShowOverrides={setShowOverrides}
          overridableFields={overridableFields}
        />

        {/* Overridable fields (expanded) */}
        <GlobalSettingsOverrideFields
          showOverrides={showOverrides}
          setShowOverrides={setShowOverrides}
          overridableFields={overridableFields}
          selectedNodeType={selectedNode.type}
          getFieldLabel={getFieldLabel}
          renderField={renderField}
        />

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
