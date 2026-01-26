# AITuberFlow API リファレンス

このドキュメントでは、AITuberFlowバックエンドサーバーのすべてのAPIエンドポイントとWebSocketイベントについて説明します。

**ベースURL:** `http://localhost:8000`（Docker）/ `http://localhost:8001`（ローカル開発）

**インタラクティブドキュメント:** `http://localhost:8000/docs` (Swagger UI)

## 目次

- [システムエンドポイント](#システムエンドポイント)
- [ワークフローAPI](#ワークフローapi)
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
  "version": "1.0.0",
  "docs": "/docs"
}
```

### GET /health

モニタリングやコンテナオーケストレーション用のヘルスチェックエンドポイント。

**レスポンス:**
```json
{
  "status": "healthy",
  "version": "1.0.0"
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

AITuberFlowはリアルタイム通信にSocket.IOを使用します。

**接続URL:** `ws://localhost:8000/ws/socket.io`

### クライアントイベント（クライアントから送信）

#### join

ワークフロームに参加して更新を受信します。

```javascript
socket.emit('join', { workflowId: 'workflow-uuid' });
```

#### leave

ワークフロームームから退出します。

```javascript
socket.emit('leave', { workflowId: 'workflow-uuid' });
```

#### workflow_start

ワークフロー実行を開始します。

```javascript
socket.emit('workflow_start', { workflowId: 'workflow-uuid' });
```

#### workflow_stop

ワークフロー実行を停止します。

```javascript
socket.emit('workflow_stop', { workflowId: 'workflow-uuid' });
```

#### node_input

ノードに入力データを送信します。

```javascript
socket.emit('node_input', {
  workflowId: 'workflow-uuid',
  nodeId: 'node-uuid',
  data: { text: 'こんにちは' }
});
```

### サーバーイベント（クライアントが受信）

#### execution.started

ワークフロー実行が開始されたときに発火します。

```javascript
socket.on('execution.started', () => {
  console.log('ワークフロー開始');
});
```

#### execution.stopped

ワークフロー実行が停止したときに発火します。

```javascript
socket.on('execution.stopped', (data) => {
  console.log('ワークフロー停止:', data.reason);
});
```

#### log

ノードがメッセージをログ出力したときに発火します。

```javascript
socket.on('log', (data) => {
  // data: { nodeId, message, level, timestamp }
  console.log(`[${data.level}] ${data.nodeId}: ${data.message}`);
});
```

#### node.status

ノードのステータスが変更されたときに発火します。

```javascript
socket.on('node.status', (data) => {
  // data: { nodeId, status, data, timestamp }
  // status: 'running' | 'completed' | 'error'
});
```

#### audio

音声が生成されたときに発火します。

```javascript
socket.on('audio', (data) => {
  // data: { filename, duration, text }
  const audioUrl = `/api/integrations/audio/${data.filename}`;
});
```

#### avatar.expression

アバターの表情が変更されたときに発火します。

```javascript
socket.on('avatar.expression', (data) => {
  // data: { expression: 'happy'|'sad'|..., intensity: 0.0-1.0 }
});
```

#### avatar.mouth

リップシンクの口の動きで発火します。

```javascript
socket.on('avatar.mouth', (data) => {
  // data: { value: 0.0-1.0, viseme?: string }
});
```

#### avatar.motion

アバターアニメーションを再生する必要があるときに発火します。

```javascript
socket.on('avatar.motion', (data) => {
  // data: { motion: 'wave'|'nod'|... }
});
```

#### avatar.update

アバター設定が更新されたときに発火します。

```javascript
socket.on('avatar.update', (payload) => {
  // 一般的なアバター更新ペイロード
});
```

#### subtitle

字幕テキストを表示する必要があるときに発火します。

```javascript
socket.on('subtitle', (data) => {
  // data: { text: '字幕テキスト' }
});
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
