# ユーザー・認証（users）

## 目的

2 人のユーザーがメールアドレス＋パスワードでログインする。全員が管理者で、権限の区別はない。

## 画面

| 画面 | パス | 内容 |
|---|---|---|
| ログイン | `/login` | メールアドレス＋パスワード。ログイン後は `redirect` 検索パラメータの画面（既定はホーム）へ |
| 設定 | `/settings` | 自分の色（スライダー）、この端末のプッシュ通知、ユーザー管理へのリンク、ログアウト。PC はサイドナビ、スマホはホームの末尾から開く |
| 管理 | `/admin/users` | ユーザー一覧（色付きのアバター）、登録（名前・メール・パスワード・色）、名前・色・パスワードの変更 |

- 未認証で保護ページを開くと `/login?redirect=<元のパス>` へ遷移する（UX 目的のガード。防御はサーバーの 401）。
- API が 401 を返したら、クライアントは `/login` へ遷移する。
- ログアウトは設定画面に置く。AppBar にアカウントメニューは置かない（画面の帯は各ページの操作にだけ使う）。

## ユーザーの色

- 各ユーザーは **OKLCH の色相（`hue`、0〜359）だけ**を選ぶ。彩度と明度はアプリが用途ごとに決めて使い回す（`shared/color.ts`: アクセント `accent`、カレンダーの帯 `fill`、薄い背景 `tint`。ライト／ダークで別の値）。OKLCH は色相を変えても知覚的な明るさ・鮮やかさが揃うので、どの色相でも同じ強さになる。
- ログイン中のユーザーの色相がアプリのアクセントカラー（MUI の `primary`）になる（`src/lib/theme.ts` の `createAppTheme`、`src/main.tsx`）。ログイン前は既定の色相（ブランドカラー `#A0148C` の色相 335）。
- カレンダーでは予定の所有者・タスクの担当者の色を使う（`src/features/users/use-user-color.ts`）。共有（`null`）は既定の色相。
- MUI のパレットは hex を要求するため、OKLCH → sRGB の変換を自前で持つ（色域外は彩度を落として収める）。CSS の `oklch()` には頼らない。
- 登録時に色相を省略すると、既存ユーザーと既定の色相から最も離れた色相を自動で割り当てる（`pickDistinctHue`）。

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
| GET | `/api/me` | ログイン中のユーザー（id, name, email, hue）。`hue` は better-auth のセッションに載らないので users から読み直す |
| GET | `/api/users` | ユーザー一覧（id, name, email, hue） |
| POST | `/api/users` | ユーザー作成（`hue` は任意） |
| PATCH | `/api/users/:id` | 名前・色相・パスワードの変更 |

`/api/users` は `server/features/users/routes.ts`。入力スキーマは `shared/validation/users.ts`。

## 表示名

所有者・担当者は常にユーザー名で表示する（「自分」とは表示しない）。共有は「共有」。選択肢はログイン中のユーザーを先頭にする（`src/features/users/use-owner-label.ts`）。

## 初期ユーザー

```sh
pnpm user:create --email you@example.com --name あなた --password 'xxxxxxxxxxxx'
```

`DATABASE_URL` に直接接続し、users service で投入する。
