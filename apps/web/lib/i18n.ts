// Simple i18n implementation
export type Locale = 'en' | 'ja';

export const translations = {
  en: {
    // Home page
    'home.title': 'AITuber Flow',
    'home.subtitle': 'Visual Workflow Editor',
    'home.newWorkflow': 'New Workflow',
    'home.import': 'Import',
    'home.loading': 'Loading...',
    'home.retry': 'Retry',
    'home.serverError': 'Make sure the backend server is running at http://localhost:8001',
    'home.templates': 'Templates',
    'home.templatesDesc': 'Start quickly with a pre-built workflow',
    'home.yourWorkflows': 'Your Workflows',
    'home.noWorkflows': 'No workflows yet',
    'home.noWorkflowsDesc': 'Create your first workflow or start from a template above',
    'home.createFirst': 'Create Your First Workflow',
    'home.nodes': 'nodes',
    'home.connections': 'connections',
    'home.delete': 'Delete',
    'home.duplicate': 'Duplicate',
    'home.export': 'Export',
    'home.deleteConfirm': 'Delete this workflow?',

    // Editor
    'editor.save': 'Save',
    'editor.saved': 'Saved',
    'editor.saving': 'Saving...',
    'editor.run': 'Run',
    'editor.stop': 'Stop',
    'editor.running': 'Running',
    'editor.back': 'Back',
    'editor.undo': 'Undo',
    'editor.redo': 'Redo',

    // Sidebar
    'sidebar.search': 'Search nodes...',
    'sidebar.input': 'Input',
    'sidebar.llm': 'LLM',
    'sidebar.tts': 'TTS',
    'sidebar.output': 'Output',
    'sidebar.control': 'Control',
    'sidebar.utility': 'Utility',

    // Node settings
    'settings.nodeSettings': 'Node Settings',
    'settings.selectNode': 'Select a node to edit',
    'settings.deleteNode': 'Delete Node',

    // Log panel
    'logs.title': 'Execution Log',
    'logs.clear': 'Clear',
    'logs.empty': 'No logs yet. Run the workflow to see execution logs.',

    // Character panel
    'character.title': 'Character',
    'character.name': 'Name',
    'character.personality': 'Personality',

    // Node types
    'node.start': 'Start',
    'node.end': 'End',
    'node.manualInput': 'Manual Input',
    'node.consoleOutput': 'Console Output',
    'node.openaiLlm': 'OpenAI LLM',
    'node.anthropicLlm': 'Claude LLM',
    'node.googleLlm': 'Gemini LLM',
    'node.ollamaLlm': 'Ollama LLM',
    'node.voicevoxTts': 'VOICEVOX TTS',
    'node.coeiroinkTts': 'COEIROINK TTS',
    'node.sbv2Tts': 'Style-Bert-VITS2',
    'node.youtubeChat': 'YouTube Chat',
    'node.twitchChat': 'Twitch Chat',
    'node.switch': 'Switch',
    'node.delay': 'Delay',
    'node.loop': 'Loop',
    'node.foreach': 'ForEach',
    'node.httpRequest': 'HTTP Request',
    'node.textTransform': 'Text Transform',
    'node.random': 'Random',
    'node.timer': 'Timer',
    'node.variable': 'Variable',

    // Status
    'status.processing': 'Processing...',
    'status.completed': 'Completed',
    'status.error': 'Error occurred',
    'status.ready': 'Ready',
  },
  ja: {
    // Home page
    'home.title': 'AITuber Flow',
    'home.subtitle': 'ビジュアルワークフローエディタ',
    'home.newWorkflow': '新規作成',
    'home.import': 'インポート',
    'home.loading': '読み込み中...',
    'home.retry': '再試行',
    'home.serverError': 'バックエンドサーバー (http://localhost:8001) が起動していることを確認してください',
    'home.templates': 'テンプレート',
    'home.templatesDesc': 'プリセットのワークフローですぐに始められます',
    'home.yourWorkflows': 'ワークフロー一覧',
    'home.noWorkflows': 'ワークフローがありません',
    'home.noWorkflowsDesc': '新規作成するか、上のテンプレートから始めましょう',
    'home.createFirst': '最初のワークフローを作成',
    'home.nodes': 'ノード',
    'home.connections': '接続',
    'home.delete': '削除',
    'home.duplicate': '複製',
    'home.export': 'エクスポート',
    'home.deleteConfirm': 'このワークフローを削除しますか？',

    // Editor
    'editor.save': '保存',
    'editor.saved': '保存済み',
    'editor.saving': '保存中...',
    'editor.run': '実行',
    'editor.stop': '停止',
    'editor.running': '実行中',
    'editor.back': '戻る',
    'editor.undo': '元に戻す',
    'editor.redo': 'やり直す',

    // Sidebar
    'sidebar.search': 'ノードを検索...',
    'sidebar.input': '入力',
    'sidebar.llm': 'LLM',
    'sidebar.tts': '音声合成',
    'sidebar.output': '出力',
    'sidebar.control': '制御',
    'sidebar.utility': 'ユーティリティ',

    // Node settings
    'settings.nodeSettings': 'ノード設定',
    'settings.selectNode': 'ノードを選択して編集',
    'settings.deleteNode': 'ノードを削除',

    // Log panel
    'logs.title': '実行ログ',
    'logs.clear': 'クリア',
    'logs.empty': 'ログがありません。ワークフローを実行するとここに表示されます。',

    // Character panel
    'character.title': 'キャラクター',
    'character.name': '名前',
    'character.personality': '性格',

    // Node types
    'node.start': '開始',
    'node.end': '終了',
    'node.manualInput': '手動入力',
    'node.consoleOutput': 'コンソール出力',
    'node.openaiLlm': 'OpenAI LLM',
    'node.anthropicLlm': 'Claude LLM',
    'node.googleLlm': 'Gemini LLM',
    'node.ollamaLlm': 'Ollama LLM',
    'node.voicevoxTts': 'VOICEVOX',
    'node.coeiroinkTts': 'COEIROINK',
    'node.sbv2Tts': 'Style-Bert-VITS2',
    'node.youtubeChat': 'YouTubeチャット',
    'node.twitchChat': 'Twitchチャット',
    'node.switch': '条件分岐',
    'node.delay': '遅延',
    'node.loop': 'ループ',
    'node.foreach': '繰り返し',
    'node.httpRequest': 'HTTPリクエスト',
    'node.textTransform': 'テキスト変換',
    'node.random': 'ランダム',
    'node.timer': 'タイマー',
    'node.variable': '変数',

    // Status
    'status.processing': '処理中...',
    'status.completed': '完了',
    'status.error': 'エラーが発生しました',
    'status.ready': '準備完了',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function getTranslation(locale: Locale, key: TranslationKey): string {
  return translations[locale][key] || translations.en[key] || key;
}
