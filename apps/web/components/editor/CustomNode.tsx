'use client';

import React, { memo, useState, useRef } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useUIPreferencesStore, type NodeDisplayMode } from '@/stores/uiPreferencesStore';
import { useLocaleStore } from '@/stores/localeStore';
import { type PortDefinition, PORT_TYPE_COLORS } from '@/lib/portTypes';

export interface CustomNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  category: 'input' | 'process' | 'output' | 'control';
  config: Record<string, unknown>;
  inputs?: PortDefinition[];
  outputs?: PortDefinition[];
  isReachable?: boolean;  // Whether this node is reachable from Start
  isEntryPoint?: boolean; // Whether this node can start execution (no inputs)
  onPlayClick?: () => void; // Callback when play button is clicked
}

export type CustomNodeType = Node<CustomNodeData>;

// Node type configurations with colors, icons, and descriptions
interface NodeTypeConfig {
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  statusText: string;
  descriptionJa: string;
  descriptionEn: string;
}

const nodeTypeConfig: Record<string, NodeTypeConfig> = {
  'start': {
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/>
      </svg>
    ),
    statusText: 'Workflow entry point',
    descriptionJa: 'ワークフローの開始点。\n【使い方】このノードから処理が始まります。次のノードに接続してください。',
    descriptionEn: 'Workflow entry point.\n[Usage] Processing starts from here. Connect to the next node.',
  },
  'end': {
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>
      </svg>
    ),
    statusText: 'Workflow exit point',
    descriptionJa: 'ワークフローの終了点。\n【使い方】処理の最後に配置。入力を受けて処理を完了します。',
    descriptionEn: 'Workflow exit point.\n[Usage] Place at the end of processing. Receives input and completes the workflow.',
  },
  'loop': {
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
    ),
    statusText: 'Loop iteration',
    descriptionJa: '指定回数だけ処理を繰り返すループノード。\n【使い方】設定で繰り返し回数を指定。body出力に繰り返す処理を接続。',
    descriptionEn: 'Loop node that repeats processing.\n[Usage] Set the repeat count in config. Connect nodes to repeat to the body output.',
  },
  'foreach': {
    color: '#F97316',
    bgColor: 'rgba(249, 115, 22, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
    statusText: 'ForEach iteration',
    descriptionJa: '配列の各要素に対して処理を繰り返すノード。\n【使い方】array入力に配列を接続。itemには現在の要素が出力されます。',
    descriptionEn: 'Node that iterates over each element in an array.\n[Usage] Connect array to input. Current element is output to item.',
  },
  'youtube-chat': {
    color: '#FF0000',
    bgColor: 'rgba(255, 0, 0, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    statusText: 'Waiting for comments...',
    descriptionJa: 'YouTubeライブのコメントを取得する入力ノード。\n【使い方】設定でVideo IDを入力。コメントが来るとmessageとauthorを出力。',
    descriptionEn: 'Input node for YouTube Live comments.\n[Usage] Set Video ID in config. Outputs message and author when comments arrive.',
  },
  'twitch-chat': {
    color: '#9146FF',
    bgColor: 'rgba(145, 70, 255, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    statusText: 'Waiting for chat...',
    descriptionJa: 'Twitchのチャットメッセージを取得する入力ノード。\n【使い方】設定でチャンネル名を入力。チャットが来るとmessageとauthorを出力。',
    descriptionEn: 'Input node for Twitch chat.\n[Usage] Set channel name in config. Outputs message and author when chats arrive.',
  },
  'manual-input': {
    color: '#22C55E',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/>
        <line x1="12" y1="4" x2="12" y2="20"/>
      </svg>
    ),
    statusText: 'Ready for input',
    descriptionJa: '手動でテキストを入力するノード。\n【使い方】実行時にテキストを入力。テスト・デバッグに便利。',
    descriptionEn: 'Manual text input node.\n[Usage] Enter text at runtime. Useful for testing and debugging.',
  },
  'openai-llm': {
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
        <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
        <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
        <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
        <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
      </svg>
    ),
    statusText: 'Model: gpt-4o-mini',
    descriptionJa: 'OpenAI APIでテキスト生成するLLMノード。\n【使い方】promptに質問を接続。設定でモデルとシステムプロンプトを指定。',
    descriptionEn: 'LLM node using OpenAI API.\n[Usage] Connect prompt input. Set model and system prompt in config.',
  },
  'voicevox-tts': {
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    ),
    statusText: 'Engine: VOICEVOX',
    descriptionJa: 'VOICEVOXでテキストを音声に変換するTTSノード。\n【使い方】textに読み上げテキストを接続。設定で話者を選択。※VOICEVOX起動が必要',
    descriptionEn: 'TTS node using VOICEVOX.\n[Usage] Connect text to read. Select speaker in config. *Requires VOICEVOX running.',
  },
  'console-output': {
    color: '#A855F7',
    bgColor: 'rgba(168, 85, 247, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    statusText: 'Ready to display',
    descriptionJa: 'データをコンソールに出力するデバッグ用ノード。\n【使い方】任意のデータを接続。画面下部のコンソールに出力されます。',
    descriptionEn: 'Debug node for console output.\n[Usage] Connect any data. Output appears in the console at the bottom.',
  },
  'switch': {
    color: '#F97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
        <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
        <line x1="4" y1="4" x2="9" y2="9"/>
      </svg>
    ),
    statusText: 'Conditional routing',
    descriptionJa: '条件に基づいて処理を分岐させるノード。\n【使い方】valueに判定値を接続。設定で条件を指定し、true/falseに分岐。',
    descriptionEn: 'Conditional branching node.\n[Usage] Connect value to check. Set conditions in config. Branches to true/false.',
  },
  'delay': {
    color: '#F97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    statusText: 'Delay: 1000ms',
    descriptionJa: '指定時間だけ処理を遅延させるノード。\n【使い方】入力を接続し、設定で遅延時間(ms)を指定。タイミング調整に使用。',
    descriptionEn: 'Delay node.\n[Usage] Connect input. Set delay time (ms) in config. Used for timing adjustments.',
  },
  'http-request': {
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    statusText: 'HTTP Request',
    descriptionJa: '外部APIにHTTPリクエストを送信するノード。\n【使い方】設定でURL・メソッド・ヘッダーを指定。レスポンスがresponseに出力。',
    descriptionEn: 'HTTP request node.\n[Usage] Set URL, method, headers in config. Response is output to response.',
  },
  'text-transform': {
    color: '#EC4899',
    bgColor: 'rgba(236, 72, 153, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/>
        <line x1="12" y1="4" x2="12" y2="20"/>
      </svg>
    ),
    statusText: 'Text Transform',
    descriptionJa: 'テキストをテンプレートで変換するノード。\n【使い方】textに入力を接続。設定でテンプレートを指定。{{text}}で入力を参照。',
    descriptionEn: 'Text transformation node.\n[Usage] Connect input to text. Set template in config. Use {{text}} to reference input.',
  },
  'random': {
    color: '#8B5CF6',
    bgColor: 'rgba(139, 92, 246, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/>
        <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
      </svg>
    ),
    statusText: 'Random Generator',
    descriptionJa: 'ランダムな値を生成するノード。\n【使い方】設定で範囲や選択肢を指定。毎回異なる値がvalueに出力。',
    descriptionEn: 'Random value generator.\n[Usage] Set range or options in config. Different value output to value each time.',
  },
  'timer': {
    color: '#06B6D4',
    bgColor: 'rgba(6, 182, 212, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    statusText: 'Timer',
    descriptionJa: '一定間隔で自動トリガーするタイマーノード。\n【使い方】設定で間隔(ms)を指定。定期実行したい処理に接続。',
    descriptionEn: 'Auto-trigger timer node.\n[Usage] Set interval (ms) in config. Connect to processes for periodic execution.',
  },
  'variable': {
    color: '#14B8A6',
    bgColor: 'rgba(20, 184, 166, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7h6M14 7h6M8 17h8"/>
        <path d="M7 3l-4 4 4 4M17 13l4 4-4 4"/>
      </svg>
    ),
    statusText: 'Variable',
    descriptionJa: 'データを保存・取得する変数ノード。\n【使い方】設定で変数名を指定。setで保存、getで取得。ワークフロー内で値を共有。',
    descriptionEn: 'Variable storage node.\n[Usage] Set variable name in config. Use set to save, get to retrieve. Share values in workflow.',
  },
  'anthropic-llm': {
    color: '#D97706',
    bgColor: 'rgba(217, 119, 6, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
        <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
        <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      </svg>
    ),
    statusText: 'Model: Claude',
    descriptionJa: 'Anthropic APIでテキスト生成するLLMノード。\n【使い方】promptに質問を接続。設定でモデルとシステムプロンプトを指定。',
    descriptionEn: 'LLM node using Anthropic API.\n[Usage] Connect prompt input. Set model and system prompt in config.',
  },
  'google-llm': {
    color: '#4285F4',
    bgColor: 'rgba(66, 133, 244, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
        <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
        <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      </svg>
    ),
    statusText: 'Model: Gemini',
    descriptionJa: 'Google AI APIでテキスト生成するLLMノード。\n【使い方】promptに質問を接続。設定でモデルとシステムプロンプトを指定。',
    descriptionEn: 'LLM node using Google AI API.\n[Usage] Connect prompt input. Set model and system prompt in config.',
  },
  'ollama-llm': {
    color: '#1F2937',
    bgColor: 'rgba(31, 41, 55, 0.3)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
        <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
        <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      </svg>
    ),
    statusText: 'Model: Ollama',
    descriptionJa: 'ローカルOllamaでテキスト生成するLLMノード。\n【使い方】promptに質問を接続。設定でモデルを指定。※Ollama起動が必要',
    descriptionEn: 'LLM node using local Ollama.\n[Usage] Connect prompt input. Set model in config. *Requires Ollama running.',
  },
  'coeiroink-tts': {
    color: '#E91E63',
    bgColor: 'rgba(233, 30, 99, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    ),
    statusText: 'Engine: COEIROINK',
    descriptionJa: 'COEIROINKでテキストを音声に変換するTTSノード。\n【使い方】textに読み上げテキストを接続。設定で話者を選択。※COEIROINK起動が必要',
    descriptionEn: 'TTS node using COEIROINK.\n[Usage] Connect text to read. Select speaker in config. *Requires COEIROINK running.',
  },
  'sbv2-tts': {
    color: '#9C27B0',
    bgColor: 'rgba(156, 39, 176, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    ),
    statusText: 'Engine: Style-Bert-VITS2',
    descriptionJa: 'Style-Bert-VITS2でテキストを音声に変換するTTSノード。\n【使い方】textに読み上げテキストを接続。設定でモデルを選択。※API起動が必要',
    descriptionEn: 'TTS node using Style-Bert-VITS2.\n[Usage] Connect text to read. Select model in config. *Requires API running.',
  },
  'avatar-controller': {
    color: '#E879F9',
    bgColor: 'rgba(232, 121, 249, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/>
      </svg>
    ),
    statusText: 'Avatar Controller',
    descriptionJa: 'VRMアバターを制御するノード。\n【使い方】expression/motion/mouthに値を接続。オーバーレイでアバターが動作。',
    descriptionEn: 'VRM avatar control node.\n[Usage] Connect values to expression/motion/mouth. Avatar animates on overlay.',
  },
  'emotion-analyzer': {
    color: '#F472B6',
    bgColor: 'rgba(244, 114, 182, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
    ),
    statusText: 'Emotion Analyzer',
    descriptionJa: 'テキストから感情を分析するノード。\n【使い方】textに分析するテキストを接続。emotion/intensityが出力。',
    descriptionEn: 'Emotion analysis node.\n[Usage] Connect text to analyze. Outputs emotion and intensity.',
  },
  'lip-sync': {
    color: '#FB7185',
    bgColor: 'rgba(251, 113, 133, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 18c-4 0-6-2-6-2s2-2 6-2 6 2 6 2-2 2-6 2z"/>
        <circle cx="12" cy="12" r="10"/>
      </svg>
    ),
    statusText: 'Lip Sync',
    descriptionJa: '音声から口パクデータを生成するノード。\n【使い方】audioに音声を接続。mouth値がリアルタイムで出力。',
    descriptionEn: 'Lip-sync generation node.\n[Usage] Connect audio input. Mouth values output in real-time.',
  },
  'subtitle-display': {
    color: '#A855F7',
    bgColor: 'rgba(168, 85, 247, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="6" width="20" height="12" rx="2"/>
        <line x1="6" y1="12" x2="18" y2="12"/>
        <line x1="6" y1="15" x2="14" y2="15"/>
      </svg>
    ),
    statusText: 'Subtitle Display',
    descriptionJa: 'オーバーレイに字幕を表示するノード。\n【使い方】textに表示テキストを接続。オーバーレイ画面に字幕が表示されます。',
    descriptionEn: 'Subtitle display node.\n[Usage] Connect text to display. Subtitles appear on overlay screen.',
  },
  'audio-player': {
    color: '#8B5CF6',
    bgColor: 'rgba(139, 92, 246, 0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
    ),
    statusText: 'Audio Player',
    descriptionJa: 'オーバーレイで音声を再生するノード。\n【使い方】audioに音声データを接続。オーバーレイ画面で音声が再生されます。',
    descriptionEn: 'Audio playback node.\n[Usage] Connect audio data. Audio plays on overlay screen.',
  },
};

// Default config for unknown node types
const defaultNodeConfig: NodeTypeConfig = {
  color: '#6B7280',
  bgColor: 'rgba(107, 114, 128, 0.1)',
  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>
  ),
  statusText: 'Ready',
  descriptionJa: 'カスタムノード',
  descriptionEn: 'Custom node',
};

interface CustomNodeProps {
  id: string;
  data: CustomNodeData;
  selected?: boolean;
}

function CustomNode({ id, data, selected }: CustomNodeProps) {
  const { nodeStatuses, selectNode } = useWorkflowStore();
  const { nodeDisplayMode } = useUIPreferencesStore();
  const { locale } = useLocaleStore();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const status = nodeStatuses[id];
  const config = nodeTypeConfig[data.type] || defaultNodeConfig;

  // Check if node is an entry point
  const isEntryPoint = data.isEntryPoint === true;

  // Tooltip show/hide with delay
  const handleMouseEnter = () => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 500); // 500ms delay
  };

  const handleMouseLeave = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setShowTooltip(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(id);
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onPlayClick) {
      data.onPlayClick();
    }
  };

  // Get status text based on running state
  const getStatusText = () => {
    if (status?.status === 'running') return 'Processing...';
    if (status?.status === 'error') return 'Error occurred';
    if (status?.status === 'completed') return 'Completed';

    // Show config-based status
    if (data.type === 'openai-llm' && data.config?.model) {
      return `Model: ${data.config.model}`;
    }
    if (data.type === 'voicevox-tts' && data.config?.speaker) {
      return `Speaker: ${data.config.speaker}`;
    }
    if (data.type === 'delay' && data.config?.delayMs) {
      return `Delay: ${data.config.delayMs}ms`;
    }
    return config.statusText;
  };

  // Get dimensions based on display mode
  const getNodeStyle = () => {
    const baseStyle = {
      background: config.bgColor,
      border: `2px solid ${selected ? config.color : 'rgba(255,255,255,0.1)'}`,
      borderRadius: '12px',
      boxShadow: selected
        ? `0 0 20px ${config.color}40, 0 4px 20px rgba(0,0,0,0.3)`
        : '0 4px 20px rgba(0,0,0,0.2)',
      transition: 'box-shadow 0.2s, border-color 0.2s',
    };

    switch (nodeDisplayMode) {
      case 'simple':
        return { ...baseStyle, padding: '8px 12px', minWidth: '120px' };
      case 'detailed':
        return { ...baseStyle, padding: '0', minWidth: '220px' };
      default: // standard
        return { ...baseStyle, padding: '12px 16px', minWidth: '180px' };
    }
  };

  // Play button component
  const PlayButton = () => (
    isEntryPoint ? (
      <button
        onClick={handlePlayClick}
        className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110 z-10"
        style={{
          background: 'linear-gradient(135deg, #10B981, #059669)',
          border: '2px solid #1F2937',
          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
        }}
        title="Run from this node"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="none">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </button>
    ) : null
  );

  // Status indicator component
  const StatusIndicator = () => (
    <>
      {status?.status === 'running' && (
        <div className="absolute -top-1 -right-1">
          <span className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse block" />
        </div>
      )}
      {status?.status === 'completed' && (
        <div className="absolute -top-1 -right-1">
          <span className="w-3 h-3 rounded-full bg-green-400 block" />
        </div>
      )}
      {status?.status === 'error' && (
        <div className="absolute -top-1 -right-1">
          <span className="w-3 h-3 rounded-full bg-red-400 block" />
        </div>
      )}
    </>
  );

  // Tooltip component
  const Tooltip = () => {
    const description = locale === 'ja' ? config.descriptionJa : config.descriptionEn;

    return showTooltip ? (
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none"
        style={{ minWidth: '180px', maxWidth: '260px' }}
      >
        <div
          className="bg-gray-900/95 backdrop-blur-sm border border-white/20 rounded-lg p-3 shadow-xl"
        >
          <div className="text-[11px] text-white/90 whitespace-pre-line leading-relaxed">
            {description}
          </div>
        </div>
        {/* Arrow */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-900/95 border-r border-b border-white/20 rotate-45"
        />
      </div>
    ) : null;
  };

  // ============ SIMPLE MODE ============
  if (nodeDisplayMode === 'simple') {
    return (
      <div
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
        style={getNodeStyle()}
      >
        <Tooltip />
        <PlayButton />

        {/* Input handles - simple circles */}
        {data.inputs && data.inputs.length > 0 && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 flex flex-col gap-1">
            {data.inputs.map((input) => (
              <Handle
                key={input.id}
                type="target"
                position={Position.Left}
                id={input.id}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: PORT_TYPE_COLORS[input.type] || '#374151',
                  border: '2px solid #1F2937',
                  position: 'relative',
                }}
              />
            ))}
          </div>
        )}

        {/* Output handles - simple circles */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 flex flex-col gap-1">
            {data.outputs.map((output) => (
              <Handle
                key={output.id}
                type="source"
                position={Position.Right}
                id={output.id}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: PORT_TYPE_COLORS[output.type] || config.color,
                  border: '2px solid #1F2937',
                  position: 'relative',
                }}
              />
            ))}
          </div>
        )}

        {/* Compact header - icon and label only */}
        <div className="flex items-center gap-2">
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              background: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <span className="font-semibold text-[12px] text-white truncate">
            {data.label}
          </span>
        </div>

        <StatusIndicator />
      </div>
    );
  }

  // ============ DETAILED MODE ============
  if (nodeDisplayMode === 'detailed') {
    return (
      <div
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
        style={getNodeStyle()}
      >
        <Tooltip />
        <PlayButton />

        {/* Header section */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              background: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <span className="font-semibold text-[12px] text-white">
            {data.label}
          </span>
        </div>

        {/* Inputs section */}
        {data.inputs && data.inputs.length > 0 && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Inputs</div>
            {data.inputs.map((input) => (
              <div key={input.id} className="flex items-center gap-2 py-1 relative">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={input.id}
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: PORT_TYPE_COLORS[input.type] || '#374151',
                    border: '1px solid #1F2937',
                    left: '-5px',
                    position: 'absolute',
                  }}
                />
                <span className="text-[11px] text-white/80 ml-2">{input.label}</span>
                <span
                  className="text-[9px] ml-auto"
                  style={{ color: PORT_TYPE_COLORS[input.type] || '#6B7280' }}
                >
                  {input.type}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Outputs section */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Outputs</div>
            {data.outputs.map((output) => (
              <div key={output.id} className="flex items-center gap-2 py-1 relative">
                <span
                  className="text-[9px]"
                  style={{ color: PORT_TYPE_COLORS[output.type] || '#6B7280' }}
                >
                  {output.type}
                </span>
                <span className="text-[11px] text-white/80 ml-auto mr-2">{output.label}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: PORT_TYPE_COLORS[output.type] || config.color,
                    border: '1px solid #1F2937',
                    right: '-5px',
                    position: 'absolute',
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Status footer */}
        <div className="px-3 py-2 text-[10px] text-white/50">
          {getStatusText()}
        </div>

        <StatusIndicator />
      </div>
    );
  }

  // ============ STANDARD MODE (default) ============
  const inputCount = data.inputs?.length || 0;
  const outputCount = data.outputs?.length || 0;
  const maxPorts = Math.max(inputCount, outputCount);

  return (
    <div
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative"
      style={getNodeStyle()}
    >
      <Tooltip />
      <PlayButton />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: config.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            flexShrink: 0,
          }}
        >
          {config.icon}
        </div>
        <span className="font-semibold text-[13px] text-white truncate">
          {data.label}
        </span>
      </div>

      {/* Ports section - only show if there are ports */}
      {maxPorts > 0 && (
        <div className="flex justify-between gap-4 my-2">
          {/* Input ports */}
          <div className="flex flex-col gap-1">
            {data.inputs?.map((input) => (
              <div key={input.id} className="flex items-center gap-1 relative h-5">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={input.id}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: PORT_TYPE_COLORS[input.type] || '#374151',
                    border: '2px solid #1F2937',
                    left: '-6px',
                    position: 'absolute',
                  }}
                />
                <span className="text-[10px] text-white/60 pl-2 whitespace-nowrap">
                  {input.label}
                </span>
              </div>
            ))}
          </div>

          {/* Output ports */}
          <div className="flex flex-col gap-1 items-end">
            {data.outputs?.map((output) => (
              <div key={output.id} className="flex items-center gap-1 relative h-5">
                <span className="text-[10px] text-white/60 pr-2 whitespace-nowrap">
                  {output.label}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: PORT_TYPE_COLORS[output.type] || config.color,
                    border: '2px solid #1F2937',
                    right: '-6px',
                    position: 'absolute',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="text-[10px] text-white/40 truncate">
        {getStatusText()}
      </div>

      <StatusIndicator />
    </div>
  );
}

export default memo(CustomNode);
