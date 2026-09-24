# ユーザー・認証（users）

## 目的

2 人のユーザーがメールアドレス＋パスワードでログインする。全員が管理者で、権限の区別はない。

## 画面

| 画面 | パス | 内容 |
|---|---|---|
| ログイン | `/login` | メールアドレス＋パスワード。ログイン後は `redirect` 検索パラメータの画面（既定はホーム）へ |
| 設定 | `/settings` | 自分の色（スライダーと保存ボタン）、この端末のプッシュ通知、終日の通知時刻（時刻と保存ボタン。既定 7:00。[notifications.md](notifications.md)）、外部連携（カレンダーの配信 URL（[calendar-feeds.md](calendar-feeds.md)）と記録投入用の API キー（[api-keys.md](api-keys.md)））、ユーザー管理へのリンク、ログアウト、バージョン（ビルドしたコミットと日時、最新版に更新するボタン）。PC はサイドナビ、スマホはホームの末尾から開く |
| OAuth 同意 | `/consent` | MCP クライアントの認可（[mcp.md](mcp.md)） |
| 管理 | `/admin/users` | ユーザー一覧（色付きのアバター）、登録（名前・メール・パスワード・色）、名前・色・パスワードの変更 |

- 未認証で保護ページを開くと `/login?redirect=<元のパス>` へ遷移する（UX 目的のガード。防御はサーバーの 401）。
- API が 401 を返したら、クライアントは `/login` へ遷移する。ログアウトと 401 のどちらでも、端末に溜めた未送信の書き込みは捨てる（別のユーザーのセッションで送らないため。[architecture.md](../architecture.md#オフラインの書き込み)）。
- ログアウトは設定画面に置く。AppBar にアカウントメニューは置かない（画面の帯は各ページの操作にだけ使う）。

## ユーザーの色

- 各ユーザーは **OKLCH の色相（`hue`、0〜359）だけ**を選ぶ。彩度と明度はアプリが用途ごとに決めて使い回す（`shared/color.ts`: アクセント `accent`、カレンダーの帯などの面 `fill`（彩度を抑えた明るいパステル調）、無地の面の上の細い線 `line`（チェックボックス・下書きの枠）、一覧の左の印 `mark`、薄い背景 `tint`。ライト／ダークで別の値）。`fill` の上の文字は無彩色の暗い 1 色 `FILL_TEXT` で、どの色相の `fill` ともコントラスト比 7:1 以上。OKLCH は色相を変えても知覚的な明るさ・鮮やかさが揃うので、どの色相でも同じ強さになる。
- ログイン中のユーザーの色相がアプリのアクセントカラー（MUI の `primary`）になる（`src/lib/theme.ts` の `useAppTheme`、`src/main.tsx`）。ログイン前は既定の色相（ブランドカラー `#A0148C` の色相 335）。
- 設定画面でスライダーを動かすと、選んだ色相がその場でアクセントカラーになる（`src/lib/theme.ts` の `previewHue`。テーマ全体に入るので、スイッチや画面上部のインジケータなど実際に使われる所で見え方を確かめられる）。保存されるのは保存ボタンを押したときだけで、押さずに設定画面を離れれば保存済みの色に戻る（`src/features/users/use-my-color.ts`）。
- カレンダーでは項目を参加者 1 人ずつの色で塗り分ける（`src/features/users/use-user-color.ts`、`src/features/events/use-participant-colors.ts`）。帯・時間軸のブロック・まだ保存していない下書きの枠も、印と同じ並びで塗り分ける（2 人は / の斜め、3 人は左上と右上の角へ開く Y の字、4 人は十字）。参加者のチェックボックス、詳細シートの参加者チップも同じ色。予定と立替の一覧の印（`VennMark`）は参加者・To／From の色の円を重ね、重なりも中心で分けてそれぞれの色で塗る。一覧のタスクのチェックボックス（`SplitCheckboxIcon`）も同じ並びで参加者の色に塗り分ける（2 人は左右、3 人は Y の字）。立替は同じ色を詳細の To／From にも使う（使い方は [expenses.md](expenses.md)）。参加者がいない（`null`）項目は、どのユーザーの色とも競合しないよう彩度 0 の無彩色。
- 色は CSS の `oklch()` のまま渡し、変換はブラウザに任せる（`shared/color.ts` の `hueColor`）。MUI のパレットも `nativeColor`（`src/lib/theme.ts`）で `oklch()` を受け、明暗の派生色と文字色は CSS の `color-mix()`・相対色で作られる。画面の色域（sRGB / Display P3）から外れる色の扱いもブラウザが決めるので、広色域の画面ではどの色相でも指定した彩度のまま出る。
  - WHY NOT sRGB の hex に変換して渡す: 変換と色域外の扱いを自前で持つことになり、広色域の画面でも sRGB の範囲に押し込めてしまう。
  - 色域外の色は画面によって少し違って見える（sRGB の画面では切り詰められる）。帯の文字（`FILL_TEXT`）のコントラスト比 7:1 は、そのままの色・sRGB に切り詰めた色・P3 に切り詰めた色のどれでも保てることをテストで確かめる（`shared/__tests__/color.test.ts`。色の計算は開発用の依存の culori を使う）。
- 登録時に色相を省略すると、既存ユーザーと既定の色相から最も離れた色相を自動で割り当てる（`pickDistinctHue`）。

## 認証

- better-auth（メール＋パスワード、Drizzle アダプタ）。テーブルは `server/lib/auth.ts` の `schema` で明示的に対応付ける（OAuth プラグインのテーブルも同じマップで渡すため）。セッション Cookie、同一オリジン。
- 公開のサインアップ経路は `disabledPaths` で閉じる。ユーザー作成は users service（サーバー内部から `auth.api.signUpEmail` を呼ぶ。`disableSignUp` は内部呼び出しも拒否するため使わない）経由で、`/admin/users` と `scripts/create-user.ts` だけが行う。メールの重複は service が事前に確認する（`autoSignIn: false` の better-auth は列挙対策として重複時も成功を装うため）。
- 名前・色・通知時刻は家族で共有するプロフィールなので他人の分も変更できるが、パスワードは本人だけが変更できる（片方のセッションを奪われたときにもう片方のアカウントまで奪われないように）。判定は `service.updateUser` が変更する人（ログイン中のユーザー）を受け取って行い、他人のパスワードなら `ForbiddenError`（403）にする。better-auth の API は本人のセッションを前提にするので使わず、repository で直接更新する（パスワードは `better-auth/crypto` の `hashPassword`）。
- パスワード変更時は対象ユーザーの全ブラウザセッションを失効させる。即時反映のため Cookie によるセッションキャッシュは使わない。
- パスワードは最低 12 文字。ハッシュは better-auth 標準（scrypt）。
- ID は UUID v7（`advanced.database.generateId`）。他テーブルの `created_by` 等が `users.id` を参照する。

## API

| メソッド | パス | 内容 |
|---|---|---|
| ANY | `/api/auth/*` | better-auth のハンドラ |
| GET | `/api/me` | ログイン中のユーザー（id, name, email, hue, allDayNotifyMinutes）と、ユーザーの一覧（`users`。id, name, email, hue）。本人は `hue` と `allDayNotifyMinutes` を better-auth の `additionalFields` に登録してあるので、セッション検証で読んだ行をそのまま返す。一覧を載せるのは、名前と色を出す所（`use-user-labels.ts` など）が本人と一覧を必ず一緒に読むため（別々に問い合わせると起動のたびに 2 本になる）。クライアントは一覧も `meQueryOptions` のキャッシュから読む（`useUsers` は `select` で一覧を取り出すだけ） |
| POST | `/api/users` | ユーザー作成（`hue` は任意）。応答は 204 |
| PATCH | `/api/users/:id` | 名前・色相・パスワード・終日の通知時刻（`allDayNotifyMinutes`、0:00 からの分）の変更。応答は 204 |

`/api/users` は `server/features/users/routes.ts`。入力スキーマは `shared/validation/users.ts`。

## MCP ツール

`users_list`（[mcp.md](mcp.md)）。

## 表示名

参加者・立替の相手は常にユーザー名で表示する（「自分」とは表示しない）。立替の To が未指定なら「共有」。選択肢はログイン中のユーザーを先頭にする（`src/features/users/use-user-labels.ts`）。参加者の複数選択は `src/features/users/components/ParticipantsField.tsx`。

一覧（`useUsers`）は名前と色を読む全部品の元で、予定の枠から立替の一覧まで画面中に散らばっている。一覧は `/api/me` に載ってくるので、取り直しは `me` と同じく 5 分に 1 度まで（`meQueryOptions` の `staleTime`。既定の 0 のままだと画面を移るたび・カレンダーの表示を切り替えるたびに取り直しが走る）。相手が色や名前を変えても、5 分経てば次に画面を移ったときに映る。自分で変えたときは書き込みが invalidate するので、その時間を待たずに入れ替わる。

## 初期ユーザー

```sh
pnpm user:create --email you@example.com --name あなた --password 'xxxxxxxxxxxx'
```

`DATABASE_URL` に直接接続し、users service で投入する。
