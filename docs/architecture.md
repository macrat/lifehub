# アーキテクチャ

LifeHub の技術的な決定事項と構造。すべての判断は [AGENTS.md](../AGENTS.md) の理念（シンプル至上主義・Web 標準優先・保守性 > 短さ）に従う。

## 前提

- 利用者は 2 人、データ量は小規模。スケーラビリティよりも単純さと正しさを優先する。
- 少人数がヘビーに使うため、初回ロードより **2 回目以降の起動速度とオフライン閲覧** を重視する。
- インフラはすべて無料枠（Vercel Hobby / Neon Free / Upstash QStash Free / HCP Terraform Free）。
- ブラウザ互換性は考慮しない。最新の Chrome と Safari（iOS 含む）のみを対象とし、ポリフィルを入れない。
- 業務ロジックはサーバー（Hono）に置く。クライアントは表示と入力に徹し、UI と MCP と通知処理が同じ Service 層を共有する。

## 技術スタック

| 領域 | 採用 | 理由 |
|---|---|---|
| ホスティング | Vercel（Hobby） | 外部 DNS からの CNAME だけで独自ドメインを割り当てられる。静的配信と Serverless Function を 1 プロジェクトで扱える。無料・カード不要。 |
| フロントエンド | React + TypeScript（strict）、Vite ビルドの SPA | オフライン対応と積極的キャッシュを単純に実現するため、SSR ではなく静的なアプリシェルにする。 |
| ルーティング | TanStack Router（ファイルベース） | 型安全なルート・検索パラメータ。TanStack Query と統合できる。 |
| データ取得・キャッシュ | TanStack Query + `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister`（ストレージは `idb-keyval` で IndexedDB） | サーバー状態の標準的な管理。永続化によりオフライン閲覧と即時起動を実現する。 |
| バックエンド | Hono（Vercel Function 1 つ、Node ランタイム） | `api/index.ts` が `server/app.ts` の Hono アプリをそのまま default export する（Vercel の Node ランタイムは `fetch` を持つオブジェクトを Web 標準ハンドラとして扱う）。Hono RPC でクライアントに API の型が伝わる。1 関数にまとめることで Hobby の関数数上限を気にしなくてよい。 |
| DB | Neon（Postgres, Free）。Terraform で直接管理（Vercel Marketplace 連携は使わない） | アイドル時のコンピュート停止によるコールドスタートは、起動時にキャッシュから描画する設計で吸収する。 |
| DB ドライバ / ORM | `@neondatabase/serverless`（HTTP）+ Drizzle ORM + drizzle-kit | サーバーレスに適した接続方式。スキーマが TypeScript で単一情報源。HTTP ドライバは問い合わせ 1 回が HTTP の往復 1 回になるので、**応答時間は読む行数よりも問い合わせの回数で決まる**。読み取りは 1 エンドポイント 1 問い合わせを基本にし、複数文の書き込みは `server/lib/db.ts` の `runBatch()` にまとめる（neon-http では `db.batch()` が 1 往復で 1 トランザクションとして実行し、node-postgres では明示的なトランザクションで包む。どちらでも全部通るか何も残らないかになる）。ローカル／テストは `drizzle-orm/node-postgres`（`server/lib/db.ts` で `VERCEL` 環境変数により切替）。 |
| ランタイム | Node.js 最新 LTS（`.node-version` と `package.json#engines` で固定） | Vercel Function と CI で同じバージョンを使う。 |
| バリデーション | Zod（`shared/validation/`）+ `@hono/zod-validator` | クライアントのフォーム・API の入力・MCP ツールの引数を同じスキーマで検証する。 |
| 認証 | better-auth（メール＋パスワード、Drizzle アダプタ） | Hono 対応。MCP 向け OAuth 2.1 プラグインを持つ。 |
| MCP サーバー | `@hono/mcp` + `@modelcontextprotocol/sdk`、Streamable HTTP（ステートレス） | 同じ Hono アプリに載せる。サーバーレスのためセッションを持たない。 |
| 繰り返しルール | RFC 5545 RRULE（`rrule` ライブラリ） | 予定・タスクで同じ仕組みを使う。展開ロジックを自作しない。 |
| プッシュ通知 | Web Push（VAPID）、`web-push` | ブラウザ標準。iOS はホーム画面に追加した PWA で対応。 |
| 通知スケジューラ | Vercel Cron（日次）+ Upstash QStash（Free） | Hobby の Cron は 1 日 1 回のため、分単位の配信は QStash の遅延配信で行う。 |
| UI | MUI（Material UI） | マテリアルデザインを「書かずに」得る。 |
| カレンダー UI | 自作の月／週グリッド（MUI 部品で構成）。日時の入力は `<input type="datetime-local">` / `<input type="date">`（MUI の TextField 経由） | 汎用カレンダーライブラリは要件に対して過剰で見た目の統一が難しい。日時入力は Web 標準で足り、スマホではネイティブのピッカーが使える。MUI X Date Pickers は date-fns アダプタがタイムゾーン非対応のため採用しない。 |
| フォーム | React 標準（`<form>` + `FormData`）+ Zod | フォームライブラリは入れない。 |
| 日付 | `Intl.DateTimeFormat` で表示、計算は date-fns（`@date-fns/tz`） | `Temporal` が Safari/Chrome 安定版で使えるようになった時点で移行を検討。 |
| PWA | `vite-plugin-pwa`（Workbox, `injectManifest`）+ Web App Manifest | アプリシェルの precache、Service Worker での push / notificationclick 処理。 |
| テスト | Vitest（クライアント: jsdom、サーバー: Node）+ Playwright（E2E） | サーバーのテストと E2E は `compose.yaml` の Postgres に対して実行する。E2E は `vite build` した成果物と `server/dev.ts` を起動して行う。 |
| Lint / Format | Biome | 単一ツールで完結し設定量が少ない。 |
| IaC | Terraform（`vercel/vercel`, `kislerdm/neon`, `hashicorp/random`）+ HCP Terraform（Free）をリモート state に使用 | Vercel・Neon の全設定をコードとして確認・編集できるようにする。 |
| CI/CD | GitHub Actions。main へのプッシュで Terraform apply → DB マイグレーション → Vercel 本番デプロイ | Vercel の Git 連携（自動デプロイ）は使わない。順序を 1 つのワークフローで保証するため。 |
| パッケージ管理 | pnpm | 高速・厳格。 |

## レイヤー構成

```
[クライアント: React SPA（静的配信）]
  features/*/queries.ts ──(Hono RPC client)──┐
                                             ▼
[Vercel Function: Hono]           routes.ts（Zod 検証 → Service を呼ぶ薄い層）
  MCP tools (mcp.ts) ────────────────────────┤
  Cron / QStash コールバック (通知) ───────────┤
                                             ▼
                                      Service 層 ──→ Repository 層 (Drizzle) ──→ Neon Postgres
                                             ▲
                              shared/ の Zod スキーマ・型（両者で共有）
```

- UI・MCP・通知処理は同じ Service 層を呼ぶ。業務ロジックを複数箇所に書かない。
- Hono のルートと MCP ツールは「入力を Zod で検証して Service を呼ぶ薄い層」に留める。
- Repository 層は Drizzle クエリのみ。ビジネスルールを持たない。
- クライアントは Service 層の結果を表示し、入力を送るだけ。計算（残高・繰り返し展開・タスクの表示位置）をクライアントで再実装しない。楽観的更新（下記）でクライアントも同じ結果を先に出す必要があるものは、再実装ではなく `shared/` に置いて両方が同じコードを使う（`calendar.ts` = 暦日への割り当てと並び、`expenses.ts` = 残高、`lemon.ts` = 世話の状態）。繰り返しの展開だけはサーバーにしか無い。
- 予定とタスクは 1 つの `events` feature（テーブルも 1 つ、`kind` で区別）。カレンダー（月・週・日・リスト）は `GET /api/events` が返す `CalendarItem[]` だけを読む。`CalendarItem` は `kind: 'event' | 'task'` と `placementDate` を持ち、予定とタスクの差はカードの描画と操作（完了ボタンの有無）と表示位置の規則にのみ現れる。

## ディレクトリ構成（機能単位で凝集）

```
api/
  index.ts                    # Vercel Function のエントリ。server/app.ts の Hono アプリをそのまま export するだけ
src/                          # クライアント（Vite + React）
  main.tsx（ルーター生成・永続化キャッシュの復元・テーマ）  routeTree.gen.ts（生成物）  sw.ts（Service Worker: push / notificationclick）
  routes/                     # TanStack Router ファイルベースルート。ページは features の部品とフックを組み立てるだけ
  features/                   # 機能ごとの UI（components/, queries.ts（クエリと mutation）, optimistic.ts（楽観的更新の書き換え。events のみ）, use-*.ts（ページの状態・操作を持つフック）, __tests__/）
    calendar/  calendar-feeds/  events/  expenses/  lemon/  users/  push/  dashboard/（ホームのカード。各機能のクエリを読む）
  lib/                        # 横断
    api.ts（Hono RPC client・WriteRequest・sendWrite）  query-client.ts（永続化設定・書き込みキュー・useOptimisticMutation・useCreateMutation・ensureData・QueryState）  form.ts（useFormSubmit・formText・formSelect・formList）  theme.ts（useAppTheme・useColorMode・previewHue（保存前のアクセントカラー））  store.ts（createStore。React の外に置く小さな値）  online.ts（useOnline）  update.ts（useUpdateApp: 最新版に入れ替えて起動し直す）  use-now.ts  date.ts  auth.ts
    ui/（AppShell（FAB_SX・通知の表示など）, ナビゲーション, Dialog + dialog-history.ts（履歴を持つダイアログ）, RecordSheet（記録 1 件のシート）, BottomSheet（下から出るシート）, notice.ts（保存の失敗などの通知）, QueryView + ListSkeleton（読み込み中の骨組みと取得失敗の表示）, CenteredPage, SettingsSection（設定画面の見出し + 行）, 共通部品）
server/                       # サーバー（Hono）
  app.ts                      # ルート登録・ミドルウェア（認証、QStash 署名検証、Cron secret）
  dev.ts                      # ローカル起動用（@hono/node-server）
  features/<name>/            # 1 機能 = 1 ディレクトリ
    schema.ts                 # Drizzle テーブル定義
    repository.ts             # DB アクセス
    service.ts                # 業務ロジック（繰り返し展開を含む）
    routes.ts                 # Hono ルート（Zod 検証 → service）
    mcp.ts                    # MCP ツール定義
    notifications.ts          # 通知対象の列挙と配信時再検証（events のみ）
    __tests__/
  lib/
    db.ts  schema.ts（全 feature の schema を集約）  auth.ts（better-auth）  env.ts  app-env.ts（Hono のコンテキスト型）
    middleware.ts（requireSession）  errors.ts（NotFound / Conflict / Validation）  test-db.ts（テスト・seed 用の truncate）
    mcp/（server.ts = 全 feature の mcp.ts を登録）  push/（購読管理・送信）  qstash.ts
    recurrence/（RRULE 展開）  notifications/（enqueue, deliver）  validator.ts（入力検証の 400 応答）
shared/                       # クライアント・サーバー共通
  validation/<feature>.ts     # Zod スキーマ（入力）
  id.ts（UUID v7 の採番。サーバーとクライアントが同じものを使う）
  types.ts（DateString の brand 型）  constants.ts（TIME_ZONE ほか）  date.ts（JST 固定の日付変換）  color.ts（OKLCH の色）
  calendar.ts（CalendarItem の形・暦日への割り当て・並び）  expenses.ts（立替の行と残高の式）  lemon.ts（世話の記録と状態）
drizzle/                      # マイグレーション SQL（生成物・コミットする）
infra/                        # Terraform
.github/workflows/            # ci.yml / deploy.yml / preview-cleanup.yml
scripts/                      # create-user.ts / seed-dev.ts / generate-vapid-keys.ts / generate-icons.ts
e2e/                          # Playwright（global-setup.ts で DB を用意し、login.ts・detail.ts・touch.ts・view.ts をテストが共有する）
```

- ローカル開発は `vite dev`（`/api` と `/.well-known` を `server/dev.ts` へプロキシ）で行い、`vercel dev` に依存しない。
- 静的ファイルは Vite の `dist/` を Vercel が配信し、SPA のフォールバック（全パス → `index.html`）は `vercel.json` の rewrites で設定する。`/api/*` は rewrite で `api/index.ts` の 1 関数に集約する（関数は元の URL を受け取るので Hono がパスで振り分ける）。Vercel CLI は `[[...route]].ts` のような catch-all を 1 セグメントしか一致させないため、ファイル名ではなく rewrite で行う。
- Cron は `vercel.json` の `crons` に UTC で書く（00:00 JST = `0 15 * * *`）。
- OAuth の探索メタデータ（`/.well-known/*`）はオリジン直下に必要なため、`vercel.json` の rewrite で `/api` の関数へ振り向ける。関数は元の URL を受け取るので、Hono は `/.well-known/*` のまま受ける（詳細は [features/mcp.md](features/mcp.md)）。
- サーバーとクライアントと E2E で tsconfig を分け（`tsconfig.server.json` / `tsconfig.client.json` / `tsconfig.shared.json` / `tsconfig.e2e.json`）、サーバーに DOM 型を、クライアントに Node 型を明示的には入れない。E2E は Playwright（Node）とページの中で動くコード（DOM）の両方を書くので、両方の型を入れる。クライアントは `server/app.ts` の `AppType` を型としてだけ参照する。
- import はすべて相対パスで `.ts` 拡張子付き（Node の型剥がし実行・Vite・Vercel のバンドラで同じ解決になる）。パスエイリアスは使わない。

## 横断機能との接続

- **MCP**: `server/features/*/mcp.ts` が `ToolRegistrar` を export し、`server/lib/mcp/server.ts` に列挙する（実装が複数あり、SDK が登録関数を要求するので registry の形にしている）。
- **ホーム**: 集約 API は持たない。`src/features/dashboard/cards/*` の各カードが自分の機能のクエリ（`useCalendarItems` / `balanceQueryOptions` / `lemonStatusQueryOptions`）をそのまま読むので、サーバーの計算結果はキャッシュに 1 つしか無く、書き込み後の無効化はその機能のキーだけで済む。カードごとに読み込みとエラーを出せる。
- **通知**: 通知源は events だけなので registry を置かず、`server/lib/notifications/service.ts` が `server/features/events/notifications.ts` を直接呼ぶ（[features/notifications.md](features/notifications.md)）。
- 新機能の追加手順は [.claude/skills/creating-new-feature/SKILL.md](../.claude/skills/creating-new-feature/SKILL.md)。

## 認証・認可

- Web: better-auth のセッション Cookie（同一オリジン）。Hono の認証ミドルウェアで `/api/*`（`/api/auth/*`・`/api/health`・通知コールバック・MCP・カレンダーの ics 配信 `/api/calendar/<token>.ics`（URL のトークンだけを資格にする。[features/calendar-feeds.md](features/calendar-feeds.md)）を除く。`/.well-known/*` はそもそも `/api` の外）を保護し、クライアントは 401 を受けたら `/login` へ遷移する。**サーバー側の検証が唯一の防御線**であり、クライアント側のルートガードは UX のためだけに置く。
- 権限: 全ユーザー管理者のため認可ロジックは書かない。ただし「誰が作成したか」は必ず記録する。
- `GET /api/health` は認証不要で DB 接続を確認する（`{ ok, db }`）。E2E の起動確認にも使う。
- パスワード: better-auth 標準のハッシュ。最低 12 文字。`scripts/create-user.ts` は better-auth のハッシュ関数を使い、`DATABASE_URL` に直接接続して投入する。
- MCP の認可は OAuth 2.1 のみ。詳細は [features/mcp.md](features/mcp.md)。

## オフラインと起動速度

- アプリシェル（HTML/JS/CSS/アイコン）は Service Worker で precache し、2 回目以降はネットワークを待たずに起動する。更新は「新版を検知したらバックグラウンドで取得し、次回起動で切替」（Workbox の `autoUpdate`）。次の起動を待たずに更新したいときは設定画面の更新ボタン（下記「PWA」）。
- TanStack Query のキャッシュを IndexedDB に永続化し、起動直後は前回のデータを即表示してからバックグラウンドで再取得する（stale-while-revalidate）。Neon のコールドスタートはこの仕組みで体感上吸収する。
- API の GET には ETag と `Cache-Control: private, no-cache` を付ける（`server/app.ts`）。`staleTime: 0` で画面を開くたびに取り直すため、変わっていない一覧をそのたびに丸ごと転送しないようにする。ブラウザが `If-None-Match` を添えて聞き直し、内容が同じなら 304 で本文が流れない（常に最新を出す性質は変わらない）。
- 既定は `staleTime: 0`（`src/lib/query-client.ts`）。画面を開くたびに裏で取り直して届いたら差し替えるので、起動時だけでなくページ遷移でも手元のデータがそのまま出たままになり、一度空になることがない。永続化の書き込みは 1 秒遅れるため、変更直後に再読み込みすると古い内容が復元されることがあり、staleTime を置くとそれが残ってしまう。取り直しを抑えたいクエリ（`me`、VAPID 鍵、カレンダーの項目）だけが個別に staleTime を持つ。カレンダーの項目は表示（月・週・日・リスト）の切り替えで取り直さないよう `staleTime` を無期限にし、画面に入ったときに取り直す（[features/calendar.md](features/calendar.md)）。
- キャッシュのキーは画面ではなくデータの単位で決める。範囲を持つクエリは表示範囲ではなく固定の区切り（カレンダーなら JST 暦月。[features/calendar.md](features/calendar.md)）をキーにし、表示や日付を切り替えても同じキャッシュに当たるようにする。
- **オフラインでも書き込める**。送れない書き込みは端末（IndexedDB）に溜め、オンラインに戻ったときに溜めた順で送る（下記「オフラインの書き込み」）。
- API レスポンスは Service Worker でキャッシュしない（データの正は TanStack Query の永続キャッシュに一本化する）。
- ルーターは永続化キャッシュの復元が終わってから起動する（`src/main.tsx`）。ログイン判定の `beforeLoad` は `ensureData`（`src/lib/query-client.ts`）を使い、オフラインではネットワークを待たずにキャッシュだけを返す（TanStack Query はオフライン中の取得を一時停止するため、`ensureQueryData` が完了しなくなる）。
- ルートに loader は置かない。データの到着を待ってから画面を切り替えると、キャッシュに無いページ（その端末で初めて開くタブ）では回線の速さのぶんだけ前の画面に留まり、操作が効いていないように見えるため。画面はマウントと同時に自分のクエリを読み、`QueryView` で「手元のデータ・骨組み・失敗」を描き分ける（下記）。
- ログイン状態（`me`）はキャッシュにあれば信じて即起動し、期限切れはサーバーの 401 で検出する。キャッシュが「未ログイン」でもオンラインなら取り直す（ログイン直後は永続化が追いつかないことがある）。
- オンラインかどうかの判定は TanStack Query の `onlineManager` に一本化する（`useOnline`）。表示（`OfflineBanner`）と実際の振る舞い（取得の一時停止・書き込みの保留）が必ず一致する。`onlineManager` は「オンラインとみなす」から始まり online/offline イベントでしか変わらないので、起動時に `navigator.onLine` を 1 度だけ反映する（`src/lib/query-client.ts`）。オフラインのまま起動しても正しく判定できる。

## オフラインの書き込み

オフラインでも記録でき、オンラインに戻ったときにまとめて送る。仕組みは TanStack Query の mutation にそのまま乗せ、キューを自作しない。

- **送る内容だけを値として持つ**。書き込み 1 回分は `{ method, path, body }`（`WriteRequest`）というプレーンな値で、mutation の引数になる。関数は保存できないので、送り方は `mutationKey` に紐づけた 1 つの既定（`setMutationDefaults`）に置く。復元した書き込みも同じ既定で送られるので、feature ごとの送信コードを起動時に読み込む必要がない。パスは Hono RPC の `$url()` で組み立て、型で守る。
- **溜める**: `networkMode: 'online'`（既定）なのでオフラインでは送らずに保留し、保留中の mutation は永続化キャッシュに含まれる（TanStack Query の既定の dehydrate 条件）。アプリを閉じても消えず、次の起動で復元して送る（`main.tsx` の `resumeWrites`）。
- **順序**: すべての書き込みが同じ `scope` を持つので 1 つずつ順に走り、「追加してから直す」が操作した順でサーバーに届く。
- **表示**: 楽観的更新の結果も同じ永続化キャッシュに入るので、オフラインで記録したものは再読み込みしても画面に出たままになる。未送信の件数は `OfflineBanner` に出す。
- **送り直し**: 通信断（`NetworkError`）だけ送り直す。サーバーが理由を返した失敗（検証エラーなど）は送り直しても変わらないので、その場で諦めて楽観的更新を戻し、通知で伝える。
- **同じ行に何度書いても同じ結果にする**: 追加する行の ID はクライアントが決めて送り（`shared/id.ts` の `newId`、`shared/validation/*.ts` の作成リクエスト）、サーバーは同じ ID の作成を upsert として扱う。オフラインで作った項目をその場で編集・削除でき（仮の ID を後から差し替えずに済む）、送り直しても二重に作られない。
- **溜めないもの**（`queue: false`）: 溜めても意味が無い書き込み。ユーザーの登録・変更はパスワードを含むので端末に残さず、オフラインではその場で失敗させる。カレンダーの配信 URL の発行・失効（[features/calendar-feeds.md](features/calendar-feeds.md)）は、発行されるまで渡す URL が無く、失効は効いたことをその場で確かめたい。プッシュ通知の購読はブラウザとサーバーの両方に繋がる操作なので溜めない。

## UI / UX 方針

- **最上位ルールはシンプリシティ**。Material Design 3 をベースにした、装飾の少ない UI。Google カレンダー／Google ToDo リストを手本にする。
- Material Design 3 の top app bar は primary 色の帯ではなく surface 色（境界線のみ）なので、AppBar・下部ナビも surface 色にする（`src/lib/theme.ts`）。primary は選択状態・FAB・終日バーなど「今の主役」だけに使う。下部ナビの選択項目は tonal な丸みのあるインジケータ、FAB は角丸 16px、ダイアログは角丸 28px、シートは上端だけ角丸 16px、ボタンは pill 形。影（elevation）は既定で 0。追加ボタン（`AddMenu`）を展開したときは Google カレンダーと同じく、背景をスクリムで暗くし（AppBar・下部ナビも覆う）、アイコンとラベルを収めた pill を右揃えで縦に並べ、FAB 自身は円に変わる。
- アクセントカラーはログイン中のユーザーの色（OKLCH の色相だけをユーザーが選び、彩度・明度はアプリが決める。`shared/color.ts`、[users.md](features/users.md)）。ログイン前は既定の色相（ブランドカラー `#A0148C` の色相）。設定画面で色を選んでいる最中は、まだ保存していない色相がテーマに入る（`src/lib/theme.ts` の `previewHue`）。secondary は使わず、強調はすべて primary で統一する。カレンダーの項目は参加者が 1 人ならそのユーザーの色、共有（参加者が 1 人でない）なら彩度 0 の無彩色（`src/features/calendar/queries.ts` の `colorUserOf`、`src/features/users/use-user-color.ts`）。同じ規則を、まだ保存していない下書きの枠と参加者のチェックボックスにも使う。
- ダークモード対応（`prefers-color-scheme` 追従、MUI の CSS 変数テーマで切替時のちらつきを避ける）。
- レスポンシブ: モバイルファースト。スマホでは下部ナビゲーション（BottomNavigation。ホーム／予定／立替／レモンの 4 つ。設定はホームの末尾から開く）、PC ではサイドナビ（permanent Drawer。設定も含む。アプリ名は出さない）に切り替える。ページ自体は共通。
- **画面の表示領域は貴重な資産**として扱う。「ホーム」「カレンダー」のような情報を持たないページタイトルは出さない（現在地はナビが示す）。同じ情報を複数箇所に出さない。主役（カレンダーのグリッド、一覧、カード）が最も広い面積を占めるようにする。
- AppBar はアプリ名の帯ではなく、そのページの操作のための帯（`AppBarContent` で Portal 経由に差し込む: カレンダーの年月と表示の切替、リスト表示・立替・レモンの検索、ユーザー登録など）。検索窓は `src/lib/ui/SearchField.tsx` を共通で使い、窓と右に並べる操作（絞り込みボタン）は1 つの塊として帯の中央に置いて最大幅で頭打ちにする（PC で帯いっぱいに伸ばすと、サイドナビの上まで窓が伸びる割に読める文字数は増えず、目とポインタの移動だけが長くなる。スマホでは帯の残り幅をすべて使う）。キーワードは画面の状態として持ち、URL の `q` は `history.replaceState` で置き換えるだけにする（`useKeywordSearch`, `src/lib/search.ts`）。ルーターで移動しないので、打った文字がそのまま同じ描画で反映され、IME の変換も途切れない。再読み込みや共有では `q` から復元する。検索窓だけで足りない画面（カレンダーのリスト表示、立替、レモン）は検索窓の右に絞り込みボタン（`src/lib/ui/FilterButton.tsx`）を置き、AppBar の下に詳細な絞り込みのフォーム（`src/lib/ui/FilterPanel.tsx`）を開く。キーワード以外の絞り込みは検索パラメータそのものを状態にし（履歴には積まず置き換える）、効いている条件の数はボタンのバッジに出す。それ以外（アカウントメニューなど）は置かない。ログアウトとユーザー管理は設定画面。スマホでは dense（48px）。
- スマホでは main の余白を 0 にし、一覧やグリッドを画面端まで広げる（edge-to-edge）。PC のみ最小限の余白を置く。
- カレンダーの月・週・日表示は画面の残り全部を占める（AppShell が下に確保する余白は負のマージンで打ち消す）。画面いっぱいの基準は `svh`（ブラウザの URL バーなどが最大に出ている状態の高さ）で、`dvh` は URL バーの出入りで値が変わり再読み込みの直後に画面より高くなってしまうため使わない。日をタップすると日表示へ、スマホでは左右のスワイプで前後へ、年月をタップすると選択ダイアログ。前後ボタンは置かない。
- 月グリッドは Google カレンダー流: 複数日・終日の予定は週ごとに 1 本の連続したバー（レーン割り当て）、時刻付き予定は「● タイトル」（時刻は PC のみ）、タスクはチェック印付き。常にタイトルを優先し、収まらない分は「+n」でまとめる。週・日は Google カレンダーと同じタイムライン（時間軸に塗りブロック、終日欄、現在時刻の線）。
- 一覧はカードを重ねずフラットな行（左に時刻列、右にタイトルと補足）で並べる。カレンダーのリスト表示は `DayList` / `ItemCard`、ホームの「今日」は同じ体裁のより簡素な行（印・時刻・タイトルだけ）。体裁は別でも、行の中のタスクのチェックと完了した行の見せ方（薄く・取り消し線）は `TaskCheckbox`（`src/features/events/components/`）に置いて共通にする。
- 一覧の行には削除などの操作ボタンを置かず、行をタップして開く詳細（`ItemDetailSheet` / `ExpenseDetailSheet` / `CareLogDetailSheet`）に操作を集める。行の主役は内容で、破壊的な操作を目立たせないため。行に残す操作はタスクの完了チェックだけ（1 タップで済ませたい主操作で、取り消しもできる）。
- 記録 1 件を出す入れ物は `RecordSheet` 1 つに揃える（スマホでは下から出るシート = `BottomSheet`、PC では中央のダイアログ）。追加のフォームも、行をタップして開く詳細も、その詳細からの編集も同じ入れ物で、違うのは中身と三点リーダーに並ぶ操作だけ。予定・タスク・立替・レモンのどれも同じ手順で読み・直し・消せる。
- 詳細は読むだけで開き、鉛筆を押す（スマホなら上へスワイプする）と同じ入れ物の中が入力欄に変わってその高さまで広がる（別のダイアログを重ねない）。操作は上端の帯に集める: 左に閉じる（バツ）、右に鉛筆（編集中・追加中は保存）と三点リーダー（削除、タスクの完了）。シートがどこまで下がっていても上端だけは見えているので、主な操作はそこに置く。帯（`SheetHeader`）は予定のクイック入力も使う。
- 見出しを出すのは**閲覧のときだけ**で、そこには対象物の名前（予定のタイトル、立替の内容、世話の種別）を出す。**追加・編集**も、**選ぶだけのダイアログ**（年月の選択、繰り返しの範囲）も見出しは置かない。何をする場かは入力欄や選択肢そのものが示すので、帯は操作（閉じる・保存）だけにする。読み上げ用の名前はどの場合も持つ（`RecordSheet` の `title`、ダイアログの `aria-label`）。名前は「年月の選択」「繰り返しの編集」のように何の場かを指す名詞にする（ボタンの文言「年月を選ぶ」とは言い回しが違う）。
- 中身の余白は Material 3 に合わせる。PC のダイアログは四辺 24px（M3 のダイアログの仕様。アイコンボタンは字面が揃うよう 8px ぶん詰める）、スマホのシートは画面の端まで使うので 16px。
- 項目が多いフォーム（予定・タスク・ユーザーの登録）は同じ `RecordSheet` を `full` で出す。スマホでは最初から画面いっぱいのシート、PC では少し広いダイアログ。下へスワイプすればそのまま取り消せる（タスク・ユーザー）。
- 記録のシート（追加・詳細・編集）は、開いた瞬間に入力欄へ焦点を当てない。スマホではソフトキーボードが立ち上がってシートの中身を覆い、何を書く入れ物なのかが読めなくなるため。例外はタスクの追加（`TaskForm`）で、タイトルを打つだけで終わることが多いので開いた所からそのまま打てるようにする。PC のクイック入力の吹き出し（`QuickEventForm`）も、タイトルだけの小さな入れ物なのでタイトルに焦点を当てる（スマホのシートでは当てない）。
- 保存を押したら送信の完了を待たずに閉じる（結果は楽観的更新で即座に画面に出る）。失敗したときだけ、入力したまま開き直して理由をフォームの先頭に出す（入力をやり直さずに直せる）。
- 下から出るシート（`src/lib/ui/BottomSheet.tsx`）は `translateY` だけで見える量を変え、止まる位置は中身の実測から決める。下へなぞって下げきると閉じる。なぞり始める場所は選ばない（入力欄やボタンの上も含む。つまむ帯だけでは狭すぎる）。縦に少し（8px）動かすまではシートを動かさないので、タップや文字の選択は今までどおり中身に届き、そこで指を捕まえるので押したことにはならない。中身のスクロールもシートが面倒を見て、指の下がまだスクロールできるならそちらを先に動かす（ブラウザ任せ（`touch-action: pan-y`）にすると、スクロールできない所でもなぞりを取り上げられてシートを動かせない）。`peekRef` を渡すと上・下の 2 段で止まり（カレンダーのクイック入力）、常に画面いっぱいの高さで、後ろを触れるようモーダルにしない。渡さなければ段は 1 つで、中身の高さのまま画面の下に出し（画面いっぱいが上限）、後ろは暗くして触れなくする。項目が少ないフォームほど入力欄も操作も指の届く下半分に集まり、後ろの一覧も見えたままになる。
- ダイアログ（`src/lib/ui/Dialog.tsx`）は開いている間だけ履歴に項目を 1 つ持つ（`useDialogHistory`）。戻る操作（ブラウザバック、iOS の画面端のスワイプ）は重なったダイアログを閉じるだけで、後ろのページまで戻らない。開いている物（選んだ項目、入力途中の値）は URL で表せないので、URL ではなく history の state に「開いているダイアログの数」だけを書く。画面の操作で閉じたときは積んだ項目を戻すので、履歴に抜け殻は残らない。閉じるのは戻る操作のときだけで、新しく積む移動では閉じない（カレンダーは予定を入力しながら月・週・日を切り替えられる。別の画面へ移るときはダイアログごとマウントが終わる）。ダイアログの中から画面を移る操作（年月の選択）は replace で行う（push すると、戻ったときに中身のないダイアログの項目を踏む）。MUI の Dialog を直接使うことは biome が禁じる。
- 入力は極力少ないタップで完了させる（ホームのクイック追加、既定値の自動入力、日付は今日を初期値）。
- 更新系は TanStack Query の mutation（`useOptimisticMutation`）で行う。送信と同時にサーバーが返すはずの値をキャッシュへ書き、失敗したら書き込み前へ戻す。送信が終われば関連クエリを invalidate してサーバーの値に合わせる（再取得の完了は待たない）。待つと操作の結果が回線の速さに左右され、切れれば永遠に出ない。オフラインでは送信が始まらないので、端末に溜めた時点で保存できたものとして扱う（フォームはそこで閉じる。待つとオンラインに戻るまで閉じられない）。
- 失敗を伝える場所は 1 つにする。フォームからの保存は開き直したフォームの中に、それ以外（削除・完了・色の変更）は画面下部の通知（Snackbar。`lib/ui/notice.ts`）に出す。
- 楽観的更新に必要な計算は `shared/` の共通コードで行い、クライアントで別実装しない。繰り返しの展開だけはサーバーにしか無いので、投機的に出すのは操作した回だけ（残りの回は再取得で揃う）。
- 移動は何も待たせない。タップした瞬間に画面を切り替え、まだ無いものは骨組み（MUI の Skeleton。`src/lib/ui/QueryView.tsx`）で示す。ページのコードを読み込む間も前の画面には留めない（`defaultPendingMs: 0` と `defaultPendingComponent`）。待つのは操作の結果ではなく内容の到着なので、待ち時間は移動の後に置く。
- クエリの状態は `QueryView`（`src/lib/ui/QueryView.tsx`）が 1 か所で描き分ける: 手元にデータがあれば取り直し中でも失敗してもそれを出し、まだ無ければ骨組み、無くて失敗しているなら理由を出す。一覧の骨組みは `ListSkeleton`。
- 画面が変わる移動は View Transition（`src/main.tsx` の `defaultViewTransition`）で繋ぐ。前後の画面に共通して在るもの（同じ予定、立替残高、レモンのカード）には同じ `view-transition-name` を付けてあり、その場から新しい位置へ動く。名前の無いものはブラウザ既定のフェード。アニメーションの記述は持たず、名前を付けるだけにする。画面が変わるのはパスが変わるときと、カレンダーの表示（月・週・日・リスト）が変わるときで、同じ画面の中の更新（スワイプでの前後移動、絞り込み、検索キーワード）では使わない（指やキーに合わせて出る所なので、そのたびに画面全体がフェードすると却って遅く見える）。判定は戻る・進むを含めどの経路でも同じになるよう router に 1 か所だけ置く。
- `view-transition-name` は文書の中で一意でなければならず、重複すると遷移そのものが行われない。同じ項目が複数描かれる所（複数日の予定、スワイプの控えの面）の扱いは [features/calendar.md](features/calendar.md) と `src/lib/theme.ts` を参照。
- フォント: システムフォント（`system-ui`）。Web フォントは読み込まない。OS の UI と同じ字面になり、待ち時間も文字の入れ替わりも起きない。
- **ブラウザではなくアプリとして触れるようにする**（`src/lib/theme.ts` の `MuiCssBaseline`）。すべて `body` / `html` に 1 か所だけ置き、個々の部品には書かない:
  - `touch-action: pan-x pan-y`: ブラウザの拡大縮小はしない。素早く続けて押しても（日を次々に選ぶ、電卓を叩く）、つまんでも画面は動かない。つまむ操作はアプリ側で使う（カレンダーの週・日表示で時間軸を縦に伸び縮みさせる。[features/calendar.md](features/calendar.md)）ので、ブラウザに取られると効かなくなる。
  - なぞっている間だけタッチの既定の動きを取り上げるのは JS 側（`src/lib/ui/touch-block.ts` の `blockTouchMove`）。掴んでいる間しか付けないので、普段のスクロールはブラウザの速い経路（passive）のまま。
  - `-webkit-tap-highlight-color: transparent`: 押したときの灰色の四角を出さない。押した手応えは MUI の ripple が示す。
  - `user-select: none` と `-webkit-touch-callout: none`: 長押ししても文字が選ばれたり、画像・リンクのメニューが出たりしない。選んで写せるのは入力欄（`input, textarea`）だけにする。読むだけの画面の文字も、鉛筆を押せば同じ場所が入力欄に変わるので、写したいときはそこから選べる。
- 引っ張って更新（Android）は残す。一覧やカレンダーでは「最新にしたい」に素直に応える動きだから。止めるのは設定とユーザー管理だけで、どちらも上端に指で動かす操作（色のスライダー）や入力があり、再読み込みに化けるとやりかけが消える。止めたい画面が `NoPullToRefresh`（`src/lib/ui/NoPullToRefresh.tsx`）を置き、`html` に `overscroll-behavior-y: contain` を当てる（ブラウザはページ全体のスクロールの設定を `html` から読むが、画面の側からそこを狙う手段は `sx` に無いので `GlobalStyles` を使う）。出している間だけ効くので後片付けが要らない。

## PWA

- Web App Manifest（`name: LifeHub`, `display: standalone`, アイコン 192/512/maskable）。`theme_color` / `background_color` は指定しない。manifest の色は 1 色しか持てず、ライト／ダークを切り替えられないため。
- ステータスバー（スマホ）とタイトルバー（PC）の色は、メディアクエリ付きの `theme-color` メタで配色ごとに渡す。値はアプリの面の色そのもの（`shared/color.ts` の `SURFACE`）で、AppBar と地続きに見える。テーマと二重管理にならないよう、index.html には直接書かず `vite.config.ts` の `themeColorMeta` が注入する。
- iOS 向け: `apple-mobile-web-app-*` メタ、`apple-touch-icon`。ステータスバーは `default`（iOS がページの背景色に合わせて塗り、文字色も選ぶ）。
- Service Worker（`vite-plugin-pwa`, `injectManifest` 方式で `src/sw.ts` を自前管理）: precache、`push` / `notificationclick` の処理。`registerType: 'autoUpdate'`（`skipWaiting` + `clientsClaim`）。
- 手動更新: 設定画面の「バージョン」の右の更新ボタン（`src/lib/update.ts`）。インストールした PWA は precache から起動するため再読み込みでは版が変わらないので、`registration.update()` で Service Worker を取りに行き直す。新版が見つかれば、それが有効になった時点で上記 `autoUpdate` の経路が読み込み直す。新版が無いときと、取りに行けなかったとき（オフライン等）だけ自分で読み込み直す（押しても何も起きない状態を作らない）。
- アイコンは `public/icons/favicon.svg`（アプリのアイコン）と `public/icons/badge.svg`（通知の小さな印）を元に `pnpm icons:generate`（Playwright の Chromium でラスタライズ）で生成し、生成物をコミットする。画像ライブラリを増やさないため。

## 運用

原則: インフラの設定はすべて `infra/` の Terraform に書き、ダッシュボードで直接変更しない。デプロイは main ブランチへのプッシュで完結する。手動作業は初回セットアップ（[README](../README.md#初回セットアップ人が一度だけ行う手作業)）だけに限定する。

### Terraform（`infra/`）

| 対象 | リソース | 備考 |
|---|---|---|
| Vercel プロジェクト | `vercel_project` | フレームワーク `vite`、`git_repository` は設定しない（自動デプロイを無効化し、デプロイは GitHub Actions が行う）。`automatically_expose_system_environment_variables` を有効にし、`VERCEL`・`VERCEL_ENV`・`VERCEL_URL`・`VERCEL_BRANCH_URL` を関数に渡す |
| ドメイン | `vercel_project_domain`（`lifehub.crat.jp`） | 外部 DNS への CNAME 登録は手動。登録先の値は `terraform output dns_cname_target` |
| 環境変数 | `vercel_project_environment_variable` | `DATABASE_URL`（Neon の出力）、`BETTER_AUTH_SECRET`・`CRON_SECRET`（`random_password`）、`QSTASH_*`・`VAPID_*`（変数から）。本番の秘密情報は production だけに置き、Preview には専用の `BETTER_AUTH_SECRET` と、デプロイ時に渡す PR ブランチの `DATABASE_URL` だけを渡す。`APP_URL` は production のみで `sensitive` ではない。production で欠けているものがあればサーバーは起動しない（`server/lib/env.ts` の `PRODUCTION_REQUIRED`） |
| Neon | `neon_project`, `neon_branch`（`dev`）, `neon_endpoint`, `neon_database`, `neon_role` | `dev` ブランチはローカル開発用。PR ごとの Preview ブランチは GitHub Actions が作成・削除する |
| 内部シークレット | `random_password` | Terraform が生成し state に保持する |
| Preview 保護 | `vercel_project.vercel_authentication`（`standard_protection_new`） | Preview URL を Vercel 認証で保護する |
| 出力 | `vercel_org_id`, `vercel_project_id`, `dns_cname_target`, `database_url`(sensitive), `neon_project_id` | GitHub Actions と初回セットアップが参照する |

- Terraform の入力（変数）として外部から渡すもの: Vercel API トークン、Neon API キーと組織 ID、Vercel のチーム、QStash トークンと署名鍵、VAPID 鍵ペア。GitHub Secrets → `TF_VAR_*` として渡す。
- GitHub Secrets はワークフローやジョブの `env` に置かず、それを使うステップの `env` にだけ渡す。テストやアプリのビルドなど依存パッケージのコードが動くステップにクレデンシャルを渡さないため。`typecheck / lint / test` ジョブは Secrets を一切受け取らず、`vercel build` にはトークンを渡さない。Terraform の出力（DB 接続文字列など）も `GITHUB_ENV` ではなくステップ出力にして、使うステップにだけ渡す。
- Terraform 対象外: Vercel Cron の定義（`vercel.json`）、外部 DNS の CNAME、DB マイグレーション、初期ユーザー作成。
- state は HCP Terraform（Free）のワークスペース `lifehub` にリモート保存し、GitHub Actions からは `TF_API_TOKEN` で接続する。
- プロバイダの更新はバージョン制約を編集する PR で行い、CI では `terraform init -upgrade` を使わない（Neon 公式が警告するリソース再作成事故を防ぐ）。PR の `terraform plan` に replace が含まれる場合はマージしない。

### デプロイフロー（GitHub Actions）

**PR（`ci.yml`）**:
1. `typecheck` → `lint` → `test` → `e2e`
2. `terraform plan`（結果を PR コメントに投稿。差分が意図通りか、replace が無いかを人と LLM が確認する）。以下 3〜6 は PR に `preview` ラベルが付いていて、かつ main への最初の `terraform apply` が済んでいるとき（state に Vercel プロジェクトがあるとき）だけ実行する。きっかけは `preview` ラベルを付けたとき・ラベルの付いた PR に push したとき・ラベルの付いた PR を開き直したときで、関係ないラベルの付け外しでは作り直さない（Vercel の 1 日あたりのデプロイ数上限に当たったため、Preview が要る PR だけをラベルで選ぶ）
3. Neon ブランチ `preview/pr-<番号>` を `main` から作成（既にあれば再利用。`neondatabase/create-branch-action`）
4. そのブランチに `drizzle-kit migrate` を適用（本番相当のデータに対してマイグレーションを検証する）
5. `vercel pull --environment=preview` → `vercel build` → `vercel deploy --prebuilt` に `--env DATABASE_URL=<PR ブランチの接続文字列>` を付けて Preview デプロイ
6. Preview URL と Neon ブランチ名を PR コメントに投稿（更新時は同じコメントを書き換える）

**PR クローズ／マージ（`preview-cleanup.yml`）**: Neon ブランチ `preview/pr-<番号>` を削除。Free プランのブランチ数上限（10）を超えないよう必ず行う。Preview を作っていない PR（`preview` ラベル無し、初回 apply 前）には消すものが無いので、Neon にブランチがあるかどうかを確かめてから削除し、無ければ何もしない。ラベルの有無では判断しない（デプロイ後にラベルを外した PR のブランチが残ってしまうため）。

**main へのプッシュ（`deploy.yml`）**: `terraform apply -auto-approve` → `drizzle-kit migrate`（`DATABASE_URL` は `terraform output`）→ `vercel pull --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod`。

Preview 環境の挙動:
- Preview の環境変数は Terraform（target = `preview`）で管理し、`DATABASE_URL` だけをデプロイ時に PR ブランチの値で上書きする。
- `VERCEL_ENV !== 'production'` のとき、日次 Cron の通知予約と QStash への publish を無効化する（Preview から本番と同じ通知が二重に飛ぶのを防ぐ）。配信コールバックの署名検証は Preview でも行う。
- better-auth の `baseURL` は、`APP_URL` があればそれに固定し、無ければ（= Preview）`VERCEL_URL`・`VERCEL_BRANCH_URL` のホストに限ってリクエストのホストから決める。Preview は URL がデプロイごとに変わるため、固定値では origin チェックに落ちてログインできない。この 2 つは Vercel のシステム環境変数なので、プロジェクト設定の公開（`automatically_expose_system_environment_variables`）が前提になる。

運用上の注意:
- マイグレーションは後方互換を保つ（列削除は「アプリが参照をやめたデプロイ」の次のデプロイで行う）。
- ロールバックはアプリ側は `vercel rollback`、インフラ側は Terraform の変更を revert してプッシュ。
- バックアップは Neon の PITR に依存。加えて月次で `pg_dump` を手動取得する運用を検討。
- 無料枠の制約: Vercel Hobby は Cron 日次のみ・関数実行時間に上限・非商用限定、Neon Free はコンピュート自動停止・ストレージ上限、QStash Free は 1 日 1,000 メッセージ・遅延最大 7 日。

## 品質基準

- TypeScript `strict: true`、`any` 禁止、`noUncheckedIndexedAccess: true`。
- Biome で lint/format を、knip で未使用のファイル・export・依存の検出を CI で強制（`pnpm lint`）。警告ゼロを維持。
- テスト: Service 層（特に繰り返し展開・残高計算・通知列挙）はユニットテスト必須。主要導線（ログイン → 記録追加 → ホーム反映）は E2E。
- Terraform も品質基準の対象: `terraform fmt -check` と `terraform validate` を CI で強制する。
- コミットは Conventional Commits。PR 単位で機能を追加する。
- 依存の更新は Dependabot（`.github/dependabot.yml`）が npm のみ・週次・まとめて 1 PR で提案し、マージは人が判断する。GitHub Actions と Terraform は対象外（プロバイダ更新はリソース再作成の事故を避けるため、バージョン制約を編集する PR で行う）。
- npm パッケージは公開から 3 日以上経ったものだけを取り込む。乗っ取られたアカウントからの publish が発覚・取り下げされるまでの猶予を取り、サプライチェーン攻撃を避けるため。Dependabot は pnpm の設定を読まない別の解決系なので、経路ごとに同じ猶予を書く: pnpm は `pnpm-workspace.yaml` の `minimumReleaseAge: 4320`（分）、Dependabot は `.github/dependabot.yml` の `cooldown.default-days: 3`。
- この猶予が効かない経路が 2 つある: CI の `pnpm install --frozen-lockfile` は解決済みのロックファイルをそのまま入れるので再検査しない。Dependabot の security updates は仕様上 cooldown の対象外で、即座に PR が作られる。
