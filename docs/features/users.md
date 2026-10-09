# ユーザー・認証（users）

## 目的

2 人のユーザーがメールアドレス＋パスワードでログインする。全員が管理者で、権限の区別はない。

## 画面

| 画面 | パス | 内容 |
|---|---|---|
| ログイン | `/login` | メールアドレス＋パスワード。ログイン後は `redirect` 検索パラメータの画面（既定はホーム）へ |
| 設定 | `/settings` | 自分の色（スライダーと保存ボタン）、この端末のプッシュ通知、終日の通知時刻（時刻と保存ボタン。既定 7:00。[notifications.md](notifications.md)）、外部連携（カレンダーの配信 URL（[calendar-feeds.md](calendar-feeds.md)）、記録投入用の API キー（[api-keys.md](api-keys.md)）、接続を許可した MCP クライアント（[mcp-clients.md](mcp-clients.md)））、お金（取り込みルール（[money.md](money.md#取り込みルール)）と立替スケジュール（[money.md](money.md#立替スケジュール)）へのリンク）、アカウント（ユーザー管理へのリンク、パスワードの変更、ログアウト）、バージョン（ビルドしたコミットと日時、最新版に更新するボタン）。開き方は [ui.md](../ui.md#レイアウトとナビゲーション) |
| OAuth 同意 | `/consent` | MCP クライアントの認可（[mcp.md](mcp.md)） |
| ユーザー管理 | `/admin/users` | 設定の「アカウント」セクションから開く（AppBar と一覧の形は [ui.md](../ui.md#見た目) の「設定から開く管理の画面」）。ユーザー一覧（色付きのアバター）、登録（右下の追加ボタン。名前・メール・パスワード・色と、登録する人の今のパスワード）、名前・色の変更（自分の分も他人の分も）。編集ではユーザー ID も出し（編集はできない）、押すとコピーする。Sentry の記録（[operations.md](../operations.md#監視sentry)）や DB と見比べるため |

- 未認証で保護ページを開くと `/login?redirect=<元のパス>` へ遷移する（UX 目的のガード。防御はサーバーの 401）。
- API が 401 を返したら、クライアントは `/login` へ遷移する。ログアウトと 401 のどちらでも、端末に溜めた未送信の書き込みは捨てる（別のユーザーのセッションで送らないため。[architecture.md](../architecture.md#オフラインの書き込み)）。
- ログアウトは設定画面に置く。AppBar にアカウントメニューは置かない（画面の帯は各ページの操作にだけ使う）。

## ユーザーの色

- 各ユーザーは **OKLCH の色相（`hue`、0〜359）だけ**を選ぶ。彩度と明度はアプリが用途ごとに決めて使い回す（`shared/color.ts`: アクセント `accent`、カレンダーの帯などの面 `fill`（彩度を抑えた明るいパステル調）、無地の面の上の細い線 `line`（チェックボックス・下書きの枠）、一覧の左の印 `mark`、薄い背景 `tint`。ライト／ダークで別の値）。`fill` の上の文字は無彩色の暗い 1 色 `FILL_TEXT` で、どの色相の `fill` ともコントラスト比 7:1 以上。OKLCH は色相を変えても知覚的な明るさ・鮮やかさが揃うので、どの色相でも同じ強さになる。
- ログイン中のユーザーの色相がアプリのアクセントカラー（MUI の `primary`）になる（`src/lib/theme.ts` の `useAppTheme`、`src/main.tsx`）。ログイン前は既定の色相（ブランドカラー `#A0148C` の色相 335）。
- 設定画面でスライダーを動かすと、選んだ色相がその場でアクセントカラーになる（`src/lib/theme.ts` の `previewHue`。テーマ全体に入るので、スイッチや画面上部のインジケータなど実際に使われる所で見え方を確かめられる）。保存されるのは保存ボタンを押したときだけで、押さずに設定画面を離れれば保存済みの色に戻る（`src/features/users/use-my-color.ts`）。
- カレンダーでは項目を参加者 1 人ずつの色で塗り分ける（`src/features/users/use-user-color.ts`、`src/features/events/use-participant-colors.ts`）。帯・時間軸のブロック・まだ保存していない下書きの枠も、印と同じ並びで塗り分ける（2 人は / の斜め、3 人は左上と右上の角へ開く Y の字、4 人は十字）。参加者のチェックボックス、詳細シートの参加者チップ（レモンの記録の記録者のチップも同じ部品 `src/features/users/components/UserChip.tsx`）も同じ色。予定と立替の一覧の印（`VennMark`）は参加者・To／From の色の円を重ね、重なりも中心で分けてそれぞれの色で塗る。一覧のタスクのチェックボックス（`SplitCheckboxIcon`）も同じ並びで参加者の色に塗り分ける（2 人は左右、3 人は Y の字）。立替は同じ色を詳細の To／From にも使う（使い方は [money.md](money.md)）。参加者がいない（`null`）項目は、どのユーザーの色とも競合しないよう彩度 0 の無彩色。
- 色は CSS の `oklch()` のまま渡し、変換はブラウザに任せる（`shared/color.ts` の `hueColor`）。MUI のパレットも `nativeColor`（`src/lib/theme.ts`）で `oklch()` を受け、明暗の派生色と文字色は CSS の `color-mix()`・相対色で作られる。画面の色域（sRGB / Display P3）から外れる色の扱いもブラウザが決めるので、広色域の画面ではどの色相でも指定した彩度のまま出る。
  - WHY NOT sRGB の hex に変換して渡す: 変換と色域外の扱いを自前で持つことになり、広色域の画面でも sRGB の範囲に押し込めてしまう。
  - 色域外の色は画面によって少し違って見える（sRGB の画面では切り詰められる）。帯の文字（`FILL_TEXT`）のコントラスト比 7:1 は、そのままの色・sRGB に切り詰めた色・P3 に切り詰めた色のどれでも保てることをテストで確かめる（`shared/__tests__/color.test.ts`。色の計算は開発用の依存の culori を使う）。
- 登録時に色相を省略すると、既存ユーザーと既定の色相から最も離れた色相を自動で割り当てる（`pickDistinctHue`）。

## 表示名

参加者・立替の相手は常にユーザー名で表示する（「自分」とは表示しない）。立替の To・From が未指定なら「共有」。選択肢はログイン中のユーザーを先頭にする（`src/features/users/use-user-labels.ts`）。参加者の複数選択は `src/features/users/components/ParticipantsField.tsx`。

一覧（`useUsers`）は名前と色を読む全部品の元で、予定の枠から立替の一覧まで画面中に散らばっている。一覧は `me.get` に載ってくるので、取り直しは `me` と同じく 5 分に 1 度まで（`meQueryOptions` の `staleTime`。既定の 0 のままだと画面を移るたび・カレンダーの表示を切り替えるたびに取り直しが走る）。相手が色や名前を変えても、5 分経てば次に画面を移ったときに映る。自分で変えたときは書き込みが invalidate するので、その時間を待たずに入れ替わる。

## 認証

- better-auth（メール＋パスワード、Drizzle アダプタ）。テーブルは `server/lib/db/auth-adapter.ts` の `schema` で明示的に対応付ける（OAuth プラグインのテーブルも同じマップで渡すため）。セッション Cookie、同一オリジン。
- 公開のサインアップ経路は `disabledPaths` で閉じる。ユーザー作成は users service（サーバー内部から `auth.api.signUpEmail` を呼ぶ。`disableSignUp` は内部呼び出しも拒否するため使わない）経由で、`/admin/users` と `scripts/create-user.ts` だけが行う。メールの重複は service が事前に確認する（`autoSignIn: false` の better-auth は列挙対策として重複時も成功を装うため）。
- 名前・色・通知時刻は家族で共有するプロフィールなので、他人の分も変更できる（`users.update`）。
- パスワードは本人だけが、設定画面の「パスワードを変更」から変える（`me.changePassword`。相手を受け取らず、ログイン中のユーザーの分しか変えられない）。片方のセッションを奪われたときに、もう片方のアカウントまで奪われないようにするため。プロフィールの変更とは別の手続きにして、本人に限ることを手続きの形で決める。repository で直接更新する（パスワードは `better-auth/crypto` の `hashPassword`）。
  - WHY NOT better-auth の `/change-password`: パスワードの置き換えとセッションの失効を 1 回の原子的な操作で行えず、失効もセッション行を消す（OAuth の参照のため、行は残して期限切れにする）。
- パスワードの変更とユーザーの登録には、操作する人の今のパスワードが要る（入力の `currentPassword`。違えば `FORBIDDEN`）。セッションを奪われたときに、パスワードを変えて持ち主を締め出したり、別のユーザーという気づかれにくい入口を作ったりできないようにするため。どちらも `server/lib/trpc.ts` の `reauthedProcedure` で作り、確かめ方と確かめを数えない理由はそこに書く。`scripts/create-user.ts` は DB に直接つなぐ経路なので求めない。
  - API キー・配信 URL の発行と MCP クライアントの許可には求めない。どれも設定画面の一覧に出て、個別に失効させられる。発行や接続のたびにパスワードを打つ手間のほうが大きい。
- パスワード変更時は本人の全ブラウザセッション（変更した端末も）を失効させ、画面はログイン画面へ移る。MCP クライアントの許可と API キー（[api-keys.md](api-keys.md)）は残す。理由は [mcp-clients.md](mcp-clients.md) の「パスワードの変更で一緒に止める」の WHY NOT と同じで、不要なものは一覧から個別に失効させる。即時反映のため Cookie によるセッションキャッシュは使わず、要求ごとにセッションを DB で確かめる（セッションとユーザーを結合して 1 回で読む。[architecture.md](../architecture.md#通信の往復)）。
- パスワードは最低 12 文字。ハッシュは better-auth 標準（scrypt）。
- ログインの試行回数を IP ごとに絞る。設定と WHY / WHY NOT は `server/lib/auth.ts` の `rateLimit`。
- ID は UUID v7（`advanced.database.generateId`）。他テーブルの `created_by` 等が `users.id` を参照する。

## 初期ユーザー

最初のユーザーは `pnpm user:create`（`scripts/create-user.ts`）で作る。`DATABASE_URL` に直接接続し、users service で投入する。手順はローカルが [README](../../README.md#ローカル開発)、本番が [operations.md](../operations.md#初回セットアップ人が一度だけ行う手作業)。

## データ

`users` と better-auth 管理のテーブル（[data-model.md](../data-model.md)）。`users.hue`（色）と `users.all_day_notify_minutes`（終日の通知時刻）をアプリが足している。

## API

| メソッド | パス | 内容 |
|---|---|---|
| ANY | `/api/auth/*` | better-auth のハンドラ |

| 手続き | 種類 | 内容 |
|---|---|---|
| `me.get` | 読み出し | ログイン中のユーザー（id, name, email, hue, allDayNotifyMinutes）と、ユーザーの一覧（`users`。id, name, email, hue）。本人は `hue` と `allDayNotifyMinutes` を better-auth の `additionalFields` に登録してあるので、セッション検証で読んだ行をそのまま返す。一覧を載せるのは、名前と色を出す所（`use-user-labels.ts` など）が本人と一覧を必ず一緒に読むため（別々に問い合わせると起動のたびに 2 本になる）。クライアントは一覧も `meQueryOptions` のキャッシュから読む（`useUsers` は `select` で一覧を取り出すだけ） |
| `me.changePassword` | 書き込み | 本人のパスワードの変更（`newPassword` と今のパスワード `currentPassword`）。全端末のセッションが切れる。値は返さない |
| `users.create` | 書き込み | ユーザー作成（`hue` は任意。登録する人の今のパスワード `currentPassword` が要る）。値は返さない |
| `users.update` | 書き込み | 名前・色相・終日の通知時刻（`allDayNotifyMinutes`、0:00 からの分）の変更（入力はユーザーの `id` と変える項目）。値は返さない |

`me` と `users` は `server/features/users/routes.ts`。入力スキーマは `shared/validation/users.ts`。

## MCP ツール

無し。ユーザーの名前とどれが自分かは `get_overview` が返し、ほかのツールは人を名前で受ける（[mcp.md](mcp.md)）。
