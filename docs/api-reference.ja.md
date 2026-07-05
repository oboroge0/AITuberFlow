# AITuberFlow API リファレンス

このドキュメントでは、AITuberFlowバックエンドサーバーのすべてのAPIエンドポイントとWebSocketイベントについて説明します。

**ベースURL:** `http://localhost:8001`（ローカル開発）/ `http://localhost:8000`（Docker）

## 目次

- [システムエンドポイント](#システムエンドポイント)
- [ワークフローAPI](#ワークフローapi)
- [記憶API](#記憶api)
- [プラグインAPI](#プラグインapi)
- [テンプレートAPI](#テンプレートapi)
- [連携API](#連携api)
- [WebSocketイベント](#websocketイベント)

---

## システムエンドポイント

### GET /

基本的なサーバー情報を返します。

**レスポンス:**
```json
{
  "name": "AITuberFlow API",
  "version": "2.0.0"
}
```

### GET /health

モニタリングやコンテナオーケストレーション用のヘルスチェックエンドポイント。

**レスポンス:**
```json
{
  "status": "healthy",
  "version": "2.0.0"
}
```

---

## ワークフローAPI

ベースパス: `/api/workflows`

### ワークフロー作成

**POST** `/api/workflows`

新しいワークフローを作成します。

**リクエストボディ:**
```json
{
  "name": "マイワークフロー",
  "description": "説明（任意）",
  "nodes": [],
  "connections": [],
  "character": {
    "name": "AIアシスタント",
    "personality": "フレンドリーで親切"
  }
}
```

**レスポンス:** `200 OK`
```json
{
  "id": "uuid-string",
  "name": "マイワークフロー",
  "description": "説明（任意）",
  "nodes": [],
  "connections": [],
  "character": {...},
  "createdAt": "2024-01-01T00:00:00",
  "updatedAt": "2024-01-01T00:00:00"
}
```

### ワークフロー一覧取得

**GET** `/api/workflows`

すべてのワークフローを更新日時順で返します。

**レスポンス:** `200 OK`
```json
[
  {
    "id": "uuid-string",
    "name": "ワークフロー名",
    "description": "...",
    "nodes": [...],
    "connections": [...],
    "character": {...},
    "createdAt": "2024-01-01T00:00:00",
    "updatedAt": "2024-01-01T00:00:00"
  }
]
```

### ワークフロー取得

**GET** `/api/workflows/{workflow_id}`

指定されたIDのワークフローを返します。

**レスポンス:** `200 OK`
```json
{
  "id": "workflow-uuid",
  "name": "ワークフロー名",
  "description": "...",
  "nodes": [...],
  "connections": [...],
  "character": {...},
  "createdAt": "2024-01-01T00:00:00",
  "updatedAt": "2024-01-01T00:00:00"
}
```

**エラー:** `404 Not Found` - ワークフローが見つかりません

### ワークフロー更新

**PUT** `/api/workflows/{workflow_id}`

既存のワークフローを更新します。すべてのフィールドは任意です。

**リクエストボディ:**
```json
{
  "name": "更新された名前",
  "description": "更新された説明",
  "nodes": [...],
  "connections": [...],
  "character": {...}
}
```

**レスポンス:** `200 OK` - 更新されたワークフローを返します

**エラー:** `404 Not Found` - ワークフローが見つかりません

### ワークフロー削除

**DELETE** `/api/workflows/{workflow_id}`

ワークフローを削除します。実行中の場合は停止も行います。

**レスポンス:** `200 OK`
```json
{
  "status": "deleted"
}
```

**エラー:** `404 Not Found` - ワークフローが見つかりません

### ワークフロー複製

**POST** `/api/workflows/{workflow_id}/duplicate`

既存のワークフローのコピーを作成します。

**レスポンス:** `200 OK` - 名前に「(コピー)」が付加された新しいワークフローを返します

**エラー:** `404 Not Found` - ワークフローが見つかりません

### ワークフローエクスポート

**GET** `/api/workflows/{workflow_id}/export`

ワークフローをポータブルなJSON形式でエクスポートします。

**レスポンス:** `200 OK`
```json
{
  "name": "ワークフロー名",
  "description": "...",
  "nodes": [...],
  "connections": [...],
  "character": {...},
  "exportedAt": "2024-01-01T00:00:00",
  "version": "1.0"
}
```

### ワークフローインポート

**POST** `/api/workflows/import`

JSONデータからワークフローをインポートします。

**リクエストボディ:** エクスポートされたワークフローJSON

**レスポンス:** `200 OK` - 新しいIDが付与されたインポートされたワークフローを返します

### ワークフロー実行開始

**POST** `/api/workflows/{workflow_id}/start`

ワークフローの実行を開始します。

**リクエストボディ（任意）:**
```json
{
  "nodes": [...],
  "connections": [...],
  "character": {...},
  "start_node_id": "node-uuid"
}
```

指定された場合、保存されたワークフローデータではなくリクエストデータを使用します。これにより、未保存の変更を実行できます。

**レスポンス:** `200 OK`
```json
{
  "status": "started",
  "workflow_id": "uuid"
}
```

### ワークフロー実行停止

**POST** `/api/workflows/{workflow_id}/stop`

実行中のワークフローを停止します。

**レスポンス:** `200 OK`
```json
{
  "status": "stopped",
  "workflow_id": "uuid"
}
```

### 実行ステータス取得

**GET** `/api/workflows/{workflow_id}/status`

ワークフローの現在の実行ステータスを返します。

**レスポンス:** `200 OK`
```json
{
  "workflow_id": "uuid",
  "status": "idle|running|error",
  "started_at": "2024-01-01T00:00:00",
  "error": null
}
```

---

## 記憶API

ベースパス: `/api/workflows`

`memory-save` / `memory-search` ノードプラグインが使うワークフロー単位の長期記憶ストア。各記憶は `workflowId` と論理的な `table_name`（`"chat-history"` や `"facts"` のように自由に名付けられるコレクション名）に紐づきます。

### 記憶一覧取得

**GET** `/api/workflows/{workflow_id}/memories`

ワークフローの記憶を、直近順またはキーワード一致で返します。

**クエリパラメータ:**
- `table_name`（任意）: 特定のテーブルに限定します。省略時は全テーブルを対象にします。
- `search_type`（任意）: `recent`（デフォルト）または `keyword`。
- `query`（`search_type=keyword` の場合は必須）: 記憶内容を検索する部分文字列。リテラルな部分一致として扱われ、`query` 内の `%` や `_` はSQLのワイルドカードではなくリテラル文字として扱われます。
- `limit`（任意）: 返却件数の上限。デフォルト `50`、最大 `500`。

**レスポンス:** `200 OK`
```json
[
  {
    "id": "uuid-string",
    "workflowId": "workflow-uuid",
    "tableName": "chat-history",
    "content": "User said hello.",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

**エラー:** `400 Bad Request` - `search_type=keyword` なのに `query` が無い

**エラー:** `404 Not Found` - ワークフローが見つかりません

### 記憶作成

**POST** `/api/workflows/{workflow_id}/memories`

新しい記憶を保存します。

**リクエストボディ:**
```json
{
  "table_name": "chat-history",
  "content": "User said hello."
}
```

**レスポンス:** `201 Created` - 作成された記憶を返します（記憶一覧取得と同じ形式）

**エラー:** `404 Not Found` - ワークフローが見つかりません

**エラー:** `400 Bad Request` - バリデーションエラー（`table_name` または `content` が未指定・空文字）

### 記憶テーブル一覧取得

**GET** `/api/workflows/{workflow_id}/memories/tables`

そのワークフローで記憶が1件以上存在する `table_name` の一覧（重複なし）を返します。

**レスポンス:** `200 OK`
```json
["chat-history", "facts"]
```

**エラー:** `404 Not Found` - ワークフローが見つかりません

### 記憶削除（一括）

**DELETE** `/api/workflows/{workflow_id}/memories`

ワークフローの全記憶を削除します。`table_name` を指定した場合はそのテーブルの記憶のみ削除します。

**クエリパラメータ:**
- `table_name`（任意）: このテーブルの記憶のみ削除します。

**レスポンス:** `200 OK`
```json
{
  "status": "deleted"
}
```

**エラー:** `404 Not Found` - ワークフローが見つかりません

### 記憶削除（単体）

**DELETE** `/api/workflows/{workflow_id}/memories/{id}`

指定したワークフローに属する記憶を1件、idで削除します。

**レスポンス:** `200 OK`
```json
{
  "status": "deleted"
}
```

**エラー:** `404 Not Found` - 記憶が見つからない、または別のワークフローに属している

---

## プラグインAPI

ベースパス: `/api/plugins`

### プラグイン一覧取得

**GET** `/api/plugins`

利用可能なすべてのノードプラグインを返します。

**レスポンス:** `200 OK`
```json
[
  {
    "id": "manual-input",
    "name": "手動入力",
    "description": "テキストを手動で入力できます",
    "category": "input",
    "inputs": [...],
    "outputs": [...],
    "config": {...}
  }
]
```

### プラグイン取得

**GET** `/api/plugins/{plugin_id}`

指定されたプラグインのマニフェストを返します。

**レスポンス:** `200 OK` - プラグインマニフェストJSON

**エラー:** `404 Not Found` - プラグインが見つかりません

### LLMノードの `system` 入力

すべてのLLMノードプラグイン（`openai-llm`、`anthropic-llm`、`google-llm`、`ollama-llm`、`groq-llm`、`mistral-llm`）は `system` 入力ポート（型: `string`）を受け付けます。上流ノード（典型的には `prompt-builder`）を `system` に接続すると、その出力がそのLLM呼び出しのシステムプロンプトとして使われます。`system` が未接続・空文字・または文字列以外の値を受け取った場合は、ノード自身の `systemPrompt` 設定フィールドにフォールバックします。LLMノードはキャラクターの人格をシステムプロンプトへ自動注入しなくなりました。必要な場合は `prompt-builder`（または `systemPrompt` 設定フィールド）で明示的に組み込んでください。

---

## テンプレートAPI

ベースパス: `/api/templates`

### テンプレート一覧取得

**GET** `/api/templates`

利用可能なすべてのワークフローテンプレートを返します。

**レスポンス:** `200 OK`
```json
[
  {
    "id": "basic-chat",
    "name": "Basic Chat",
    "name_ja": "基本チャット",
    "description": "Simple chat workflow",
    "description_ja": "シンプルなチャットワークフロー",
    "nodeCount": 3,
    "connectionCount": 2
  }
]
```

### テンプレート取得

**GET** `/api/templates/{template_id}`

すべてのノードと接続を含む完全なテンプレートを返します。

**レスポンス:** `200 OK` - 完全なテンプレートJSON

**エラー:** `404 Not Found` - テンプレートが見つかりません

---

## 連携API

ベースパス: `/api/integrations`

### VOICEVOX連携

#### スピーカー取得

**GET** `/api/integrations/voicevox/speakers`

利用可能なVOICEVOXスピーカーとそのスタイルを返します。

**クエリパラメータ:**
- `host`（任意）: VOICEVOXホストURL。デフォルト: `http://localhost:50021`

**レスポンス:** `200 OK`
```json
{
  "speakers": [
    {
      "id": 1,
      "name": "四国めたん",
      "style": "ノーマル",
      "label": "四国めたん (ノーマル)"
    }
  ]
}
```

**エラー:** `503 Service Unavailable` - VOICEVOXに接続できません

#### ヘルスチェック

**GET** `/api/integrations/voicevox/health`

VOICEVOXにアクセス可能かどうかを確認します。

**クエリパラメータ:**
- `host`（任意）: VOICEVOXホストURL

**レスポンス:** `200 OK`
```json
{
  "status": "healthy|unhealthy",
  "version": "0.14.0",
  "host": "http://localhost:50021"
}
```

### 音声ファイル

#### 音声配信

**GET** `/api/integrations/audio/{filename}`

生成された音声ファイル（WAVのみ）を配信します。

**レスポンス:** `200 OK` - 音声ファイル (audio/wav)

**エラー:** `404 Not Found` - ファイルが見つかりません

### モデル管理

#### モデルアップロード

**POST** `/api/integrations/models/upload`

VRMモデルまたは画像ファイルをアップロードします。

**リクエスト:** `multipart/form-data`
- `file`: モデルファイル (.vrm, .png, .jpg, .jpeg, .gif, .webp)

**レスポンス:** `200 OK`
```json
{
  "success": true,
  "filename": "abc12345_model.vrm",
  "url": "/api/integrations/models/file/abc12345_model.vrm",
  "size": 1234567
}
```

#### モデル一覧取得

**GET** `/api/integrations/models`

アップロードされたすべてのモデルを返します。

**レスポンス:** `200 OK`
```json
{
  "models": [
    {
      "filename": "model.vrm",
      "url": "/api/integrations/models/file/model.vrm",
      "size": 1234567,
      "type": "vrm"
    }
  ]
}
```

#### モデル削除

**DELETE** `/api/integrations/models/{filename}`

アップロードされたモデルを削除します。

**レスポンス:** `200 OK`
```json
{
  "success": true,
  "message": "Deleted model.vrm"
}
```

#### モデルファイル配信

**GET** `/api/integrations/models/file/{filename}`

アップロードされたモデルファイルを配信します。

**レスポンス:** `200 OK` - 適切なメディアタイプのモデルファイル

### アニメーション管理

#### アニメーションアップロード

**POST** `/api/integrations/animations/upload`

アニメーションファイル（Mixamo FBXなど）をアップロードします。

**リクエスト:** `multipart/form-data`
- `file`: アニメーションファイル (.fbx, .glb, .gltf)

**レスポンス:** `200 OK`
```json
{
  "success": true,
  "filename": "abc12345_idle.fbx",
  "url": "/api/integrations/animations/file/abc12345_idle.fbx",
  "size": 123456
}
```

#### アニメーション一覧取得

**GET** `/api/integrations/animations`

アップロードされたすべてのアニメーションを返します。

**レスポンス:** `200 OK`
```json
{
  "animations": [
    {
      "filename": "idle.fbx",
      "url": "/api/integrations/animations/file/idle.fbx",
      "size": 123456,
      "type": "fbx"
    }
  ]
}
```

#### アニメーション削除

**DELETE** `/api/integrations/animations/{filename}`

アップロードされたアニメーションを削除します。

**レスポンス:** `200 OK`
```json
{
  "success": true,
  "message": "Deleted idle.fbx"
}
```

#### アニメーションファイル配信

**GET** `/api/integrations/animations/file/{filename}`

アップロードされたアニメーションファイルを配信します。

**レスポンス:** `200 OK` - 適切なメディアタイプのアニメーションファイル

---

## WebSocketイベント

AITuberFlowはリアルタイム通信にネイティブWebSocketを使用します。

**接続URL:** `ws://localhost:8001/ws`（ローカル）/ `ws://localhost:8000/ws`（Docker）

すべてのメッセージは `type` フィールドとオプションの `payload` フィールドを持つJSON形式です。

### クライアントメッセージ（クライアントから送信）

#### join

ワークフロールームに参加して更新を受信します。

```javascript
const ws = new WebSocket('ws://localhost:8001/ws');
ws.send(JSON.stringify({
  type: 'join',
  payload: { workflowId: 'workflow-uuid' }
}));
```

#### leave

ワークフロールームから退出します。

```javascript
ws.send(JSON.stringify({
  type: 'leave',
  payload: { workflowId: 'workflow-uuid' }
}));
```

#### workflow_start

ワークフロー実行を開始します。

```javascript
ws.send(JSON.stringify({
  type: 'workflow_start',
  payload: { workflowId: 'workflow-uuid' }
}));
```

#### workflow_stop

ワークフロー実行を停止します。

```javascript
ws.send(JSON.stringify({
  type: 'workflow_stop',
  payload: { workflowId: 'workflow-uuid' }
}));
```

#### node_input

ノードに入力データを送信します。

```javascript
ws.send(JSON.stringify({
  type: 'node_input',
  payload: {
    workflowId: 'workflow-uuid',
    nodeId: 'node-uuid',
    data: { text: 'こんにちは' }
  }
}));
```

### サーバーメッセージ（クライアントが受信）

すべてのメッセージは `ws.onmessage` で受信し、JSONからパースします：

```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'execution.started': // ...
    case 'log': // ...
  }
};
```

#### execution.started

ワークフロー実行が開始されたときに送信されます。

```json
{ "type": "execution.started" }
```

#### execution.stopped

ワークフロー実行が停止したときに送信されます。

```json
{ "type": "execution.stopped", "reason": "user" }
```

#### execution.error

ワークフロー実行エラーが発生したときに送信されます。

```json
{ "type": "execution.error", "error": "エラーメッセージ", "nodeId": "node-uuid" }
```

#### log

ノードがメッセージをログ出力したときに送信されます。

```json
{ "type": "log", "nodeId": "node-uuid", "message": "処理中...", "level": "info" }
```

#### node.status

ノードのステータスが変更されたときに送信されます。

```json
{ "type": "node.status", "nodeId": "node-uuid", "status": "running", "data": {} }
```

ステータス値: `idle` | `running` | `completed` | `error`

#### audio

音声が生成されたときに送信されます。

```json
{ "type": "audio", "filename": "output_12345.wav", "text": "こんにちは" }
```

音声ファイルは `GET /api/integrations/audio/{filename}` で取得できます。

#### avatar.expression

アバターの表情が変更されたときに送信されます。

```json
{ "type": "avatar.expression", "expression": "happy", "intensity": 0.8 }
```

#### avatar.mouth

リップシンクの口の動きで送信されます。

```json
{ "type": "avatar.mouth", "value": 0.5 }
```

#### avatar.motion

アバターアニメーションを再生する必要があるときに送信されます。

```json
{ "type": "avatar.motion", "motionUrl": "/api/integrations/animations/file/wave.fbx" }
```

#### avatar.update

アバター状態の更新時に送信されます。

```json
{ "type": "avatar.update", "expression": "neutral", "mouthOpen": 0 }
```

#### subtitle

字幕テキストを表示する必要があるときに送信されます。

```json
{ "type": "subtitle", "text": "字幕テキスト" }
```

---

## エラーレスポンス

すべてのエンドポイントで以下のエラーレスポンスが返される可能性があります：

### 400 Bad Request

無効なリクエストデータ。

```json
{
  "detail": "エラーの説明"
}
```

### 404 Not Found

リソースが見つかりません。

```json
{
  "detail": "ワークフローが見つかりません"
}
```

### 422 Unprocessable Entity

バリデーションエラー。

```json
{
  "detail": [
    {
      "loc": ["body", "name"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

### 500 Internal Server Error

サーバーエラー。

```json
{
  "detail": "内部サーバーエラー"
}
```

### 503 Service Unavailable

外部サービスが利用できません。

```json
{
  "detail": "http://localhost:50021 のVOICEVOXに接続できません"
}
```

---

## データ型

### Node

```typescript
interface Node {
  id: string;           // UUID
  type: string;         // プラグインID (例: "manual-input")
  position: {
    x: number;
    y: number;
  };
  data: {
    label: string;
    config: Record<string, any>;
  };
}
```

### Connection

```typescript
interface Connection {
  id: string;           // UUID
  from: {
    nodeId: string;
    port: string;       // 出力ポート名
  };
  to: {
    nodeId: string;
    port: string;       // 入力ポート名
  };
}
```

### Character

```typescript
interface Character {
  name: string;
  personality: string;
}
```

### Workflow

```typescript
interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: Node[];
  connections: Connection[];
  character: Character;
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```
