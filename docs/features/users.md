# ユーザー・認証（users）

## 目的

2 人のユーザーがメールアドレス＋パスワードでログインする。全員が管理者で、権限の区別はない。

## 画面

| 画面 | パス | 内容 |
|---|---|---|
| ログイン | `/login` | メールアドレス＋パスワード。ログイン後は `redirect` 検索パラメータの画面（既定はホーム）へ |
| 管理 | `/admin/users` | ユーザー一覧、登録（名前・メール・パスワード）、名前の変更、パスワードの変更 |

- 未認証で保護ページを開くと `/login?redirect=<元のパス>` へ遷移する（UX 目的のガード。防御はサーバーの 401）。
- API が 401 を返したら、クライアントは `/login` へ遷移する。
- ナビゲーションにログアウトを置く。

## 認証

- better-auth（メール＋パスワード、Drizzle アダプタ、`usePlural`）。セッション Cookie、同一オリジン。
- サインアップは無効（`disableSignUp`）。ユーザー作成は `/admin/users`（`auth.api.createUser` を使う内部 API）と `scripts/create-user.ts` だけ。
- パスワードは最低 12 文字。ハッシュは better-auth 標準（scrypt）。
- ID は UUID v7（`advanced.database.generateId`）。他テーブルの `created_by` 等が `users.id` を参照する。

## API

| メソッド | パス | 内容 |
|---|---|---|
| ANY | `/api/auth/*` | better-auth のハンドラ |
| GET | `/api/users` | ユーザー一覧（id, name, email） |
| POST | `/api/users` | ユーザー作成 |
| PATCH | `/api/users/:id` | 名前・パスワードの変更 |

`/api/users` は `server/features/users/routes.ts`。入力スキーマは `shared/validation/users.ts`。

## 表示名

「自分／相手／共有」の表示は、`users.name` とログイン中のユーザー ID から決める。所有者・担当者の選択肢は「共有」「自分の名前」「相手の名前」。

## 初期ユーザー

```sh
pnpm user:create --email you@example.com --name あなた --password 'xxxxxxxxxxxx'
```

`DATABASE_URL` に直接接続し、better-auth の `createUser` で投入する。
