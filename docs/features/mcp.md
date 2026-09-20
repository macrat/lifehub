# MCP サーバー（mcp）

## 目的

任意の AI ツール（Claude 等）から LifeHub のデータを参照・登録する。UI と同じ Service 層を呼ぶ。

## エンドポイント

- `/api/mcp`、Streamable HTTP、ステートレス（サーバーレスのためセッションを持たない）。
- 認可は OAuth 2.1 のみ（MCP 仕様の標準。PKCE 必須）。better-auth の `@better-auth/mcp` プラグイン（`@better-auth/oauth-provider` を MCP 向けに設定したもの）で LifeHub 自身を認可サーバーにする。クライアント識別は Client ID Metadata Documents（`@better-auth/cimd`）を優先し、Dynamic Client Registration も有効にする。
- 認可サーバーのメタデータは `/.well-known/oauth-authorization-server`、保護リソースのメタデータは `/.well-known/oauth-protected-resource`。いずれも better-auth のハンドラへ委譲する。
- ログインページ `/login`、同意ページ `/consent`（署名付きクエリを better-auth クライアントプラグインがそのまま返す）。
- アクセストークンは JWT。`/api/mcp` では `requireMcpAuth` で JWKS により検証し、`sub` をユーザー ID として service に渡す。

## ツール一覧

命名は `<feature>_<verb>_<object>`。引数スキーマは `shared/validation` の Zod を共有する。説明文は AI が正しく使えるよう具体的に書く。

| ツール | 内容 |
|---|---|
| `events_list` | 期間内の予定の発生を列挙する |
| `events_create` | 予定を作成する |
| `events_update` | 予定を更新する（`scope`: all / this / following） |
| `events_delete` | 予定を削除する（`scope`: all / this / following） |
| `tasks_list` | 期間内のタスク（表示規則適用済み）を列挙する |
| `tasks_create` | タスクを作成する |
| `tasks_complete` | タスクの発生を完了にする |
| `tasks_update` | タスクを更新する |
| `calendar_list_items` | 予定＋タスクの統合一覧（`placementDate` 付き） |
| `expenses_get_balance` | 立替残高を返す |
| `expenses_add` | 立替を追加する |
| `expenses_settle` | 現在の残高で精算する |
| `lemon_get_status` | レモンの世話状況（種別ごとの最終実施日と経過日数） |
| `lemon_log_care` | レモンの世話を記録する |

各 feature の `mcp.ts` が `registerTools(server, ctx)` を export し、`server/lib/mcp/server.ts` で登録する。
