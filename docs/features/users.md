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
- 公開のサインアップ経路は `disabledPaths` で閉じる。ユーザー作成は users service（サーバー内部から `auth.api.signUpEmail` を呼ぶ。`disableSignUp` は内部呼び出しも拒否するため使わない）経由で、`/admin/users` と `scripts/create-user.ts` だけが行う。メールの重複は service が事前に確認する（`autoSignIn: false` の better-auth は列挙対策として重複時も成功を装うため）。
- 名前・パスワードの変更は他人の分も行えるため better-auth の API ではなく repository で直接更新する（パスワードは `better-auth/crypto` の `hashPassword`）。
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

`DATABASE_URL` に直接接続し、users service で投入する。
