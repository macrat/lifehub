# MCP サーバー（mcp）

## 目的

任意の AI ツール（Claude 等）から LifeHub のデータを参照・登録する。UI と同じ Service 層を呼ぶ。

## エンドポイント

- `/api/mcp`、Streamable HTTP、ステートレス（サーバーレスのためセッションを持たない）。
- 認可は OAuth 2.1 のみ（MCP 仕様の標準。PKCE 必須）。better-auth の `@better-auth/mcp` プラグイン（`@better-auth/oauth-provider` を MCP 向けに設定したもの）で LifeHub 自身を認可サーバーにする。クライアント識別は Client ID Metadata Documents（`@better-auth/cimd`）を優先し、Dynamic Client Registration も有効にする。
- 認可サーバー（issuer）は `https://lifehub.crat.jp/api/auth`。探索メタデータは RFC 8414 / 9728 のとおりオリジン直下に置く: `/.well-known/oauth-authorization-server/api/auth`、`/.well-known/oauth-protected-resource/api/mcp`。オリジン直下は Vercel では静的配信の領域なので、`vercel.json` の rewrite（ローカルは vite の proxy）で `/api` の 1 関数へ振り向ける。rewrite でも関数が受け取る URL は元のパスのままなので、Hono は `/.well-known/*` をそのパスのまま受けて better-auth のハンドラへ渡す。
- ログインページ `/login`、同意ページ `/consent`。better-auth は署名付きクエリを付けてこれらへリダイレクトし、クライアントの `oauthProviderClient` がその署名付きクエリを `oauth_query` として API 呼び出しに添える。ログイン後は better-auth が返す URL（同意画面またはクライアントの `redirect_uri`）へ移動する。
- アクセストークンは JWT（`jwt` プラグイン。JWKS は `/api/auth/jwks`）。jwt プラグインの `/token`（セッション → JWT 交換）は `disabledPaths` で閉じる。`/api/mcp` では `requireMcpAuth` が署名・issuer・audience（`resource`）・期限を検証し、`sub` をユーザー ID としてツールに渡す。
- プラグインのテーブル（`jwks`, `oauth_clients`, `oauth_resources`, `oauth_client_resources`, `oauth_refresh_tokens`, `oauth_access_tokens`, `oauth_consents`, `oauth_client_assertions`）は `server/lib/mcp/schema.ts`。列は `npx auth generate` の出力に合わせ、名前だけ共通規約に寄せている。

## ツール一覧

命名は `<feature>_<verb>_<object>`。引数スキーマは `shared/validation` の Zod を共有する。説明文は AI が正しく使えるよう具体的に書く。

| ツール | 内容 |
|---|---|
| `events_list` | 期間内の予定とタスク（繰り返し展開済み、`placementDate` 付き）を列挙する |
| `events_create` | 予定またはタスクを作成する（`kind`） |
| `events_update` | 更新する（`scope`: all / this / following） |
| `events_delete` | 削除する（`scope`: all / this / following） |
| `events_complete` | タスクを完了にする（繰り返しは `occurrenceStart` で回を指定） |
| `events_uncomplete` | 完了を取り消す |
| `users_list` | ユーザーの ID と名前（`isMe` で認可した本人が分かる） |
| `expenses_get_balance` | 立替残高を返す |
| `expenses_list` | 立替の履歴（精算を含む）の 1 ページ。画面と同じ絞り込みができ、`nextCursor` を `before` に渡すと前のページ |
| `expenses_add` | 立替（精算を含む）を追加する |
| `lemon_get_status` | レモンの世話状況（項目ごとの最終実施日と経過日数） |
| `lemon_log_care` | レモンの世話を記録する（1 件に項目を複数まとめられる） |

各 feature の `mcp.ts` が `ToolRegistrar`（`(server, ctx) => void`）を export し、`server/lib/mcp/server.ts` で登録する。入力スキーマには `shared/validation` の Zod オブジェクトをそのまま渡す（refine も効く）。MCP サーバーはリクエストごとに組み立てるステートレス構成（`@hono/mcp` の `StreamableHTTPTransport`、`enableJsonResponse`）。

## 接続方法

MCP クライアントに `https://lifehub.crat.jp/api/mcp` を登録する。初回はブラウザでログインと同意を求められる。Dynamic Client Registration（`/api/auth/oauth2/register`）と Client ID Metadata Documents の両方に対応している。
