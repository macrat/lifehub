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
| DB ドライバ / ORM | `@neondatabase/serverless`（HTTP）+ Drizzle ORM + drizzle-kit | サーバーレスに適した接続方式。スキーマが TypeScript で単一情報源。HTTP ドライバは問い合わせ 1 回が HTTP の往復 1 回になるので、**応答時間は読む行数よりも問い合わせの回数で決まる**。読み取りは 1 エンドポイント 1 問い合わせを基本にし、複数文の書き込みは `server/lib/db/client.ts` の `runBatch()` にまとめる（neon-http では `db.batch()` が 1 往復で 1 トランザクションとして実行し、node-postgres では明示的なトランザクションで包む。どちらでも全部通るか何も残らないかになる）。ローカル／テストは `drizzle-orm/node-postgres`（`server/lib/db/client.ts` で `VERCEL` 環境変数により切替）。 |
| ランタイム | Node.js 最新 LTS（`.node-version` と `package.json#engines` で固定） | Vercel Function と CI で同じバージョンを使う。 |
| バリデーション | Zod（`shared/validation/`）+ `@hono/zod-validator` | クライアントのフォームと API の入力を同じスキーマで検証する。MCP ツールの引数は LLM に合わせて別に形を決め（下記「レイヤー構成」）、項目の定義がそのまま使えるときだけ共有する。 |
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
| テスト | Vitest（クライアント: jsdom、共有（shared）とサーバー: Node。3 つを別のプロジェクトにし、DB を使うのはサーバーだけ）+ Playwright（E2E） | サーバーのテストと E2E は `compose.yaml` の Postgres に対して実行する。E2E は `vite build` した成果物と `server/dev.ts` を起動して行う。 |
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
  Cron（/api/cron/*）/ QStash（/api/qstash/*）─┤
                                             ▼
                                      Service 層 ──→ Repository 層 (Drizzle) ──→ Neon Postgres
                                             ▲
                              shared/ の Zod スキーマ・型（両者で共有）
```

- UI・MCP・通知処理は同じ Service 層を呼ぶ。業務ロジックを複数箇所に書かない。
- Hono のルートと MCP ツールは「入力を Zod で検証して Service を呼ぶ薄い層」に留める。
- **MCP ツールは API ではなく LLM 向けのインターフェース**として作る。REST API は自分のクライアントだけが呼ぶ内部の口で、型の厳密さ（判別共用体、省略させない項目）を優先してよい。MCP ツールは LLM が説明を読んで正しく呼べることを最優先にし、API の形をなぞらない（例: 入力の最上位は平らなオブジェクトにし、`anyOf` にしない。考えなくてよい項目は省略させ、既定を置く。組み合わせの誤りは何を足せばよいかの文で返す）。LLM の入力を Service の入力に直すのは `mcp.ts` の役目。API の変更に合わせて MCP の形を変える必要は無く、逆も同じ。
- Repository 層は Drizzle クエリのみ。ビジネスルールを持たない。
- 層と依存の向きは Biome の `noRestrictedImports`（`biome.json` の overrides）で強制する。
  - サーバー: `repository.ts`・`schema.ts` と DB の土台（`lib/db/`。接続・全表の集約・repository が使う問い合わせの部品・better-auth のアダプタ・ヘルスチェック・テストの DB）を除いて、`lib/db/` と `drizzle-orm` を import できない。例外は `lib/db/auth-adapter.ts` と `lib/db/health.ts` だけで、`lib/db/` に足したファイルは既定で外から読めない。自分の `./repository.ts` 以外の repository も読めない（他の feature のデータはその feature の service を通す）。`routes.ts` / `mcp.ts` は自分の feature の repository も読めず、入力の検証は `lib/validator.ts` の `validate` だけを使う。`lib/` は features を読まない（DB の表の定義 `features/*/schema.ts` だけは、全表の集約（`lib/db/schema.ts`）と DB の土台のために読める）。feature を組み立てるのは `server/` 直下の入口（`app.ts`・`cron.ts`・`qstash.ts`・`mcp.ts`）だけ。
  - クライアント: API（`lib/api.ts`）を呼べるのは `features/*/queries.ts` と `lib/` だけ。`lib/` は `features/` を読まない。events は calendar を読まない（予定・タスクのデータは events が持ち、依存は calendar → events の一方向）。部品と画面は MUI の Dialog / Modal などを直接使わない（`lib/ui` の Dialog / RecordSheet を使う）。
  - 置き場所の間: `shared/` は `server/` も `src/` も読まない。`server/` は `src/` を読まない。`src/` は `server/` を読まない（API の型だけは `src/lib/api.ts` が `server/app.ts` の `AppType` を `import type` で読む。Biome の規則は型だけの import を見分けないので、`api.ts` には `server/app.ts` だけを許す規則を掛け、それ以外のサーバーのコードは読めないままにしている）。
  - Biome の override は、同じ規則の options を足し合わせず後の物で置き換える。そこで import の規則の override は「どのファイルもどれか 1 つの組み合わせに当たる」ように分け、各 override にそのファイルに掛かる禁止をすべて書く（禁止の文言が override の間で重なるのはこのため）。規則を足すときは、その規則が掛かるファイルを含む override すべてに足す。
  - WHY NOT dependency-cruiser（規則を足し合わせられ、型だけの import も見分けられる）: TypeScript 7 は JS のコンパイラ API を持たず、dependency-cruiser が TS を読めない。
- クライアントは Service 層の結果を表示し、入力を送るだけ。計算（残高・繰り返し展開・タスクの表示位置）をクライアントで再実装しない。楽観的更新（下記）でクライアントも同じ結果を先に出す必要があるものは、再実装ではなく `shared/` に置いて両方が同じコードを使う（`calendar.ts` = 暦日への割り当てと並び、`expenses.ts` = 残高、`lemon.ts` = 世話の状態）。繰り返しの展開だけはサーバーにしか無い。
- 予定とタスクは 1 つの `events` feature（テーブルも 1 つ、`kind` で区別）。カレンダー（月・週・日・リスト）は `GET /api/calendar` が返す `CalendarItem[]`（と、同じ応答に載るその期間の祝日・天気）だけを読む。`CalendarItem` は `kind: 'event' | 'task'` と `placementDate` を持ち、予定とタスクの差はカードの描画と操作（完了ボタンの有無）と表示位置の規則にのみ現れる。

## ディレクトリ構成（機能単位で凝集）

```
api/
  index.ts                    # Vercel Function のエントリ。server/app.ts の Hono アプリをそのまま export するだけ
src/                          # クライアント（Vite + React）
  main.tsx（ルーター生成・永続化キャッシュの復元・テーマ）  routeTree.gen.ts（生成物）  sw.ts（Service Worker: push / notificationclick）
  routes/                     # TanStack Router ファイルベースルート。ページは features の部品とフックを組み立てるだけ
  features/                   # 機能ごとの UI（components/, queries.ts（クエリと mutation）, optimistic.ts（楽観的更新の書き換え。events のみ）, use-*.ts（ページの状態・操作を持つフック）, __tests__/）
    api-keys/  calendar/  calendar-feeds/  events/  expenses/  lemon/  memos/  users/  push/  dashboard/（ホームの状態のタイル。各機能のクエリを読む）
    timeline/（ホームのタイムライン。全機能の記録を 1 本に並べ、行から各機能の詳細を開く）
      （calendar は events の項目を暦の上に並べる画面。項目のクエリ・書き込み・参加者の印は events が持ち、依存は calendar → events の一方向）
    add/（右下の追加ボタンと、種類から各機能の追加フォームを選ぶ `AddForm`。機能をまたぐのでどれにも属さない）
  lib/                        # 横断。features を読まない（依存は features → lib の一方向。biome が禁じる）
    api.ts（Hono RPC client・WriteRequest・sendWrite）  query-client.ts（永続化設定・書き込みキュー・useOptimisticMutation・useCreateMutation・QueryState）  form.ts（useFormSubmit・formText・formSelect・formList）  theme.ts（useAppTheme・useColorMode・previewHue（保存前のアクセントカラー））  store.ts（createStore。React の外に置く小さな値）  online.ts（useOnline）  update.ts（useUpdateApp: 最新版に入れ替えて起動し直す）  use-now.ts  date.ts  add-pages.ts + add-search.ts（入力を開いて始める URL のしるし `add`）  auth.ts（ログイン状態のすべて: me・ルートのガード・ログイン・ログアウト・同意・未ログインの反映）
    ui/（AppShell（通知の表示など）+ layout.ts（枠の寸法・FAB_SX）, ナビゲーション, Dialog + dialog-history.ts（履歴を持つダイアログ）, RecordSheet（記録 1 件のシート）+ use-record-detail.tsx（閲覧と編集の切り替え・削除。直せない記録は読むだけ）, use-record-selection.ts（一覧から開いている記録と、閲覧・編集のどちらで開いたか）, use-toggle.ts（開いているかだけの状態 useToggle・値を持って開く状態 useOpenWith。開け閉めの関数は固定）, BottomSheet（下から出るシート）, notice.ts（保存の失敗などの通知）, QueryView + ListSkeleton（読み込み中の骨組みと取得失敗の表示）, CenteredPage, SettingsSection（設定画面の見出し + 行）, 共通部品）
iot/                          # LifeHub に記録を送るデバイスのファームウェア（Arduino）。記録投入用エンドポイントを API キーで呼ぶ
  lemon-record-button/        # レモンの世話を記録するボタン（M5Stack AtomS3R）
server/                       # サーバー（Hono）
  app.ts                      # ルート登録・ミドルウェア（認証）。ここと下の 3 つが各 feature を組み立てる所
  cron.ts                     # Vercel Cron の入口（/api/cron/*。Cron secret を全体に 1 度だけ検査する）
  qstash.ts                   # QStash の配信コールバックの入口（/api/qstash/*。署名を全体に 1 度だけ検査する）
  mcp.ts                      # MCP の入口（/api/mcp。OAuth で保護）と、全 feature の mcp.ts の登録
  dev.ts                      # ローカル起動用（@hono/node-server）
  features/<name>/            # 1 機能 = 1 ディレクトリ
    schema.ts                 # Drizzle テーブル定義
    repository.ts             # DB アクセス
    service.ts                # 業務ロジック（繰り返し展開を含む）
    routes.ts                 # Hono ルート（Zod 検証 → service）
    mcp.ts                    # MCP ツール定義
    notifications.ts          # 通知対象の列挙と配信時再検証（events のみ）
  features/notifications/     # 通知の予約・配信（service）、送信済み台帳（repository）、QStash への予約（publisher.ts）
    __tests__/
  lib/                        # 横断の土台。features を読まない（DB の表の定義 `features/*/schema.ts` だけは例外。biome が禁じる）
    db/（DB の土台。client.ts = 接続と runBatch、schema.ts = 全 feature の schema の集約、oauth-schema.ts = OAuth プラグインの表、
        history.ts = 履歴のページ分け・キーワード・タイムラインの問い合わせ、auth-adapter.ts = better-auth のアダプタ、
        health.ts = ヘルスチェック、test-db.ts = テスト・seed 用の全表の消去とテスト用ユーザー）
    auth.ts（better-auth）  env.ts  app-env.ts（Hono のコンテキスト型）  middleware.ts（requireSession）  errors.ts（NotFound / Forbidden / Conflict / Validation）
    mcp/types.ts（ツールの登録関数の型と結果の形）  qstash.ts（QStash の署名検証）  after-response.ts（応答を返した後に続ける処理。Vercel の waitUntil）
    recurrence/（RRULE 展開）  timeline-source.ts（タイムラインが各 feature から記録を集める口の型）  validator.ts（入力検証。`validate`）
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
- Cron は `vercel.json` の `crons` に UTC で書く（00:00 JST = `0 15 * * *`）。Cron が呼ぶ入口は `/api/cron/*`（`server/cron.ts`）の 1 か所に集め、`CRON_SECRET` の Bearer トークンの検査をその集まり全体に 1 度だけ掛ける。Cron を足すときは `crons` と `cron.ts` に 1 行ずつ足すだけで、機能ごとに認証の外の入口を増やさず、保護の付け忘れも起きない。今あるのは日次の通知の予約（`/api/cron/notifications`。[features/notifications.md](features/notifications.md)）と、月次の祝日の取り直し（`/api/cron/holidays`。[features/calendar.md](features/calendar.md#祝日)）と、1 日 3 回の天気の取り直し（`/api/cron/weather`。日ごとと 3 時間ごと。[features/calendar.md](features/calendar.md#天気)）と、日次の前日の最高・最低気温の観測値での上書き（`/api/cron/weather/observed`。同）。Hobby の Cron は 1 つの式が 1 日 1 回までなので、1 日に何度も呼びたい入口は、時をずらした日次の式を同じパスに並べる。
- 2 人だけが使う非公開のアプリなので、検索エンジンに載せない。クロールは `public/robots.txt`（全パスを `Disallow`）で断り、索引は `vercel.json` の全パスへの `X-Robots-Tag: noindex, nofollow` ヘッダで断る。ヘッダは HTML 以外（API の JSON やアイコン）にも効き、`<meta name="robots">` と違って `index.html` を経ない応答も覆えるため、meta タグではなくヘッダで付ける。robots.txt を守らないクローラーでもヘッダで索引から外れ、robots.txt を守るクローラーはそもそも取りに来ない。
- OAuth の探索メタデータ（`/.well-known/*`）はオリジン直下に必要なため、`vercel.json` の rewrite で `/api` の関数へ振り向ける。関数は元の URL を受け取るので、Hono は `/.well-known/*` のまま受ける（詳細は [features/mcp.md](features/mcp.md)）。
- サーバーとクライアントと E2E で tsconfig を分け（`tsconfig.server.json` / `tsconfig.client.json` / `tsconfig.shared.json` / `tsconfig.e2e.json`）、サーバーに DOM 型を、クライアントに Node 型を明示的には入れない。E2E は Playwright（Node）とページの中で動くコード（DOM）の両方を書くので、両方の型を入れる。クライアントは `server/app.ts` の `AppType` を型としてだけ参照する。
- import はすべて相対パスで `.ts` 拡張子付き（Node の型剥がし実行・Vite・Vercel のバンドラで同じ解決になる）。パスエイリアスは使わない。

## 横断機能との接続

- **MCP**: `server/features/*/mcp.ts` が `ToolRegistrar` を export し、`server/mcp.ts` に列挙する（実装が複数あり、SDK が登録関数を要求するので registry の形にしている）。
- **ホーム**（[features/home.md](features/home.md)）: 状態のタイル（`src/features/dashboard/components/StatusCards.tsx`）は各機能のクエリ（`useBalance` / `lemonStatusQueryOptions`）をそのまま読むので、サーバーの計算結果はキャッシュに 1 つしか無い。タイムラインは全機能の記録を 1 本に並べる集約の API（`GET /api/timeline`、`server/features/timeline/`）を読む。各機能の service から記録を集めるだけで、記録の規則は各機能が持つ。どの機能の書き込みもタイムラインのキー（`src/features/timeline/queries.ts` の `TIMELINE_QUERY_KEY`）を invalidate する。
- **通知**: 通知源は events だけなので registry を置かず、`server/features/notifications/service.ts` が `server/features/events/notifications.ts` を直接呼ぶ（[features/notifications.md](features/notifications.md)）。
- 新機能の追加手順は [.claude/skills/creating-new-feature/SKILL.md](../.claude/skills/creating-new-feature/SKILL.md)。

## 認証・認可

- Web: better-auth のセッション Cookie（同一オリジン）。Hono の認証ミドルウェアで `/api/*`（`/api/auth/*`・`/api/health`・Vercel Cron（`/api/cron/*`）・QStash の配信コールバック（`/api/qstash/*`）・MCP・カレンダーの ics 配信 `/api/calendar/<token>.ics`（URL のトークンだけを資格にする。[features/calendar-feeds.md](features/calendar-feeds.md)）・記録投入 `/api/records`（API キーだけを資格にする。[features/api-keys.md](features/api-keys.md)）を除く。`/.well-known/*` はそもそも `/api` の外）を保護し、クライアントは 401 を受けたら `/login` へ遷移する。**サーバー側の検証が唯一の防御線**であり、クライアント側のルートガードは UX のためだけに置く。
- 権限: 全ユーザー管理者のため認可ロジックは書かない。ただし「誰が作成したか」は必ず記録する。
- `GET /api/health` は認証不要で DB 接続を確認する（`{ ok, db }`）。E2E の起動確認にも使う。
- パスワード: better-auth 標準のハッシュ。最低 12 文字。`scripts/create-user.ts` は better-auth のハッシュ関数を使い、`DATABASE_URL` に直接接続して投入する。
- MCP の認可は OAuth 2.1 のみ。詳細は [features/mcp.md](features/mcp.md)。

## オフラインと起動速度

- アプリシェル（HTML/JS/CSS/アイコン）は Service Worker で precache し、2 回目以降はネットワークを待たずに起動する。更新は「新版を検知したらバックグラウンドで取得し、次回起動で切替」（Workbox の `autoUpdate`）。次の起動を待たずに更新したいときは設定画面の更新ボタン（下記「PWA」）。
- TanStack Query のキャッシュを IndexedDB に永続化し、起動直後は前回のデータを即表示してからバックグラウンドで再取得する（stale-while-revalidate）。Neon のコールドスタートはこの仕組みで体感上吸収する。
- API の GET には ETag と `Cache-Control: private, no-cache` を付ける（`server/app.ts`）。`staleTime: 0` で画面を開くたびに取り直すため、変わっていない一覧をそのたびに丸ごと転送しないようにする。ブラウザが `If-None-Match` を添えて聞き直し、内容が同じなら 304 で本文が流れない（常に最新を出す性質は変わらない）。
- 既定は `staleTime: 0`（`src/lib/query-client.ts`）。画面を開くたびに裏で取り直して届いたら差し替えるので、起動時だけでなくページ遷移でも手元のデータがそのまま出たままになり、一度空になることがない。永続化の書き込みは 1 秒遅れるため、変更直後に再読み込みすると古い内容が復元されることがあり、staleTime を置くとそれが残ってしまう。取り直しを抑えたいクエリ（`me`（ユーザーの一覧も載る）、VAPID 鍵、カレンダーの項目）だけが個別に staleTime を持つ。カレンダーの項目は表示（月・週・日・リスト）の切り替えで取り直さないよう `staleTime` を無期限にし、画面に入ったときに取り直す（[features/calendar.md](features/calendar.md)）。`me` は 5 分（[features/users.md](features/users.md)）。
- API はこのアプリの画面専用なので、互換性や REST としての形より通信の本数と量を優先して形を決める。画面が必ず一緒に使うものは 1 つの応答にまとめ（カレンダーの項目と祝日・天気は `GET /api/calendar`、ログイン中のユーザーとユーザーの一覧は `GET /api/me`）、画面が読まないものは返さない（書き込みの応答は本文の無い 204。画面は送った内容で先に書き換え、後の取り直しで揃えるので、書き込みの応答を読まない。`sendWrite` も本文を読まない。例外は API キーの発行で、キーそのものを見せられるのは発行の応答だけなので本文で返す）。MCP は同じ service を使うが、応答の形は MCP のツール側で決める。
- キャッシュのキーは画面ではなくデータの単位で決める。範囲を持つクエリは表示範囲ではなく固定の区切り（カレンダーなら JST 暦月。[features/calendar.md](features/calendar.md)）をキーにし、表示や日付を切り替えても同じキャッシュに当たるようにする。
- **オフラインでも書き込める**。送れない書き込みは端末（IndexedDB）に溜め、オンラインに戻ったときに溜めた順で送る（下記「オフラインの書き込み」）。
- API レスポンスは Service Worker でキャッシュしない（データの正は TanStack Query の永続キャッシュに一本化する）。
- ルーターは永続化キャッシュの復元が終わってから起動する（`src/main.tsx`）。ログイン判定の `beforeLoad` は `resolveMe`（`src/lib/auth.ts`）を使い、オフラインではネットワークを待たずにキャッシュだけを返す（TanStack Query はオフライン中の取得を一時停止するため、待つと完了しない）。
- ルートに loader は置かない。データの到着を待ってから画面を切り替えると、キャッシュに無いページ（その端末で初めて開くタブ）では回線の速さのぶんだけ前の画面に留まり、操作が効いていないように見えるため。画面はマウントと同時に自分のクエリを読み、`QueryView` で「手元のデータ・骨組み・失敗」を描き分ける（下記）。
- ログイン状態（`me`）はキャッシュにあれば信じて即起動し、期限切れはサーバーの 401 で検出する。キャッシュが「未ログイン」でもオンラインなら取り直す（ログイン直後は永続化が追いつかないことがある）。ログイン画面だけは、キャッシュにユーザーがいてもオンラインならサーバーに確かめてから「済んでいるので見せない」を決める（期限の切れたキャッシュでアプリへ送り返さないため）。ログイン状態に関わる判定と操作は `src/lib/auth.ts` に集め、画面（routes）はそれを呼ぶだけにする。
- オンラインかどうかの判定は TanStack Query の `onlineManager` に一本化する（`useOnline`）。表示（`OfflineBanner`）と実際の振る舞い（取得の一時停止・書き込みの保留）が必ず一致する。`onlineManager` は「オンラインとみなす」から始まり online/offline イベントでしか変わらないので、起動時に `navigator.onLine` を 1 度だけ反映する（`src/lib/query-client.ts`）。オフラインのまま起動しても正しく判定できる。

## オフラインの書き込み

オフラインでも記録でき、オンラインに戻ったときにまとめて送る。仕組みは TanStack Query の mutation にそのまま乗せ、キューを自作しない。

- **送る内容だけを値として持つ**。書き込み 1 回分は `{ method, path, body }`（`WriteRequest`）というプレーンな値で、mutation の引数になる。関数は保存できないので、送り方は `mutationKey` に紐づけた 1 つの既定（`setMutationDefaults`）に置く。復元した書き込みも同じ既定で送られるので、feature ごとの送信コードを起動時に読み込む必要がない。パスは Hono RPC の `$url()` で組み立て、型で守る。
- **溜める**: `networkMode: 'online'`（既定）なのでオフラインでは送らずに保留し、保留中の書き込みは永続化キャッシュに含まれる（`persistOptions` の dehydrateOptions が、保留中の mutation のうち書き込みのキーを持つものだけを残す。既定を持たないほかの mutation は、残すと送り方の無いまま復元されるため）。アプリを閉じても消えず、次の起動で復元して送る（`main.tsx` の `resumeWrites`）。
- **順序**: すべての書き込みが同じ `scope` を持つので 1 つずつ順に走り、「追加してから直す」が操作した順でサーバーに届く。
- **表示**: 楽観的更新の結果も同じ永続化キャッシュに入るので、オフラインで記録したものは再読み込みしても画面に出たままになる。未送信の件数は `OfflineBanner` に出す（帯は「オフラインモード」の一言と、未送信があるときだけその件数）。
- **送り直し**: 通信断（`NetworkError`）だけ送り直す。サーバーが理由を返した失敗（検証エラーなど）は送り直しても変わらないので、その場で諦めて楽観的更新を戻し、通知で伝える。
- **同じ行に何度書いても同じ結果にする**: 追加する行の ID はクライアントが決めて送り（`shared/id.ts` の `newId`、`shared/validation/*.ts` の作成リクエスト）、サーバーは同じ ID の作成が既にあれば何も書かない（送られた値で上書きしない。作った後に編集してから古い作成が再送されると、上書きでは編集が巻き戻るため）。オフラインで作った項目をその場で編集・削除でき（仮の ID を後から差し替えずに済む）、送り直しても二重に作られない。
- **未ログインになったら捨てる**: ログアウトしたとき、API が 401 を返したときは、溜めた書き込みを捨てる（`src/lib/auth.ts` の `markSignedOut`）。書き込みは送る時点のセッションで送られるので、残すと次にログインした別のユーザーとして送られてしまう。401 のときに残して同じユーザーの再ログインを待つことはしない: 401 はオンラインでしか起きず、オンラインでは溜めた書き込みはすぐ送られて同じ 401 で失敗するので、残しても通る見込みが無い。
- **書いた人のものとしてだけ送る**: 書き込みは送る時点のセッションで送られるので、書き込みごとに書いたときのユーザーを持ち、送る試行のたびに今のユーザーと比べる（`sendAsAuthor`）。違えば送らずに諦める。ログアウトは溜めた書き込みを捨てるが、送り直しを待っている書き込みは TanStack Query では止められず、その間に別のユーザーでログインすると、その人の記録として保存されてしまうため。
- **溜めないもの**（`queue: false`）: 溜めても意味が無い書き込み。ユーザーの登録・変更はパスワードを含むので端末に残さず、オフラインではその場で失敗させる。カレンダーの配信 URL の発行・変更・失効（[features/calendar-feeds.md](features/calendar-feeds.md)）は、発行されるまで渡す URL が無く、変更と失効は効いたことをその場で確かめたい（誰の予定が配られるかが変わる）。API キーの失効も同じ理由で溜めない（発行は応答のキーを画面に出すので、この仕組みを使わずに応答を待つ）。プッシュ通知の購読はブラウザとサーバーの両方に繋がる操作なので溜めない。溜めない書き込みは溜める書き込みと別の mutationKey（`direct-write`）で送り、溜めた書き込みの順番待ち（scope）にも端末に残す対象にも入れない。同じキーだと、溜めた書き込みがある間はその後ろで待ち、待つ間は保留中として端末に残る（パスワードが IndexedDB に書かれる）うえ、オンラインに戻るまで結果が出ない。

## UI / UX 方針

- **最上位ルールはシンプリシティ**。Material Design 3 をベースにした、装飾の少ない UI。Google カレンダー／Google ToDo リストを手本にする。
- Material Design 3 の top app bar は primary 色の帯ではなく surface 色（境界線のみ）なので、AppBar・下部ナビも surface 色にする（`src/lib/theme.ts`）。primary は選択状態・FAB・終日バーなど「今の主役」だけに使う。下部ナビの選択項目は tonal な丸みのあるインジケータ、ホームのタイルとカレンダーの帯・ブロックは角だけなめらかな角丸（角を超楕円でつなぐ。`src/lib/ui/squircle.ts` の `smoothCornersMask` の mask で切り抜く）、FAB はスクワークル（超楕円。`src/lib/ui/squircle.ts` の clip-path で切り抜き、影は外側の要素に drop-shadow で付ける。clip-path は要素自身の影も切り取るため）、ダイアログは角丸 28px、シートは上端だけ角丸 16px、ボタンは pill 形。影（elevation）は既定で 0。追加ボタン（`AddMenu`）を展開したときは Google カレンダーと同じく、背景をスクリムで暗くし（AppBar・下部ナビも覆う）、アイコンとラベルを収めた pill を右揃えで縦に並べ、FAB 自身は円に変わる（同じ点の数の polygon どうしなので、形がなめらかに補間される）。
- アクセントカラーはログイン中のユーザーの色（OKLCH の色相だけをユーザーが選び、彩度・明度はアプリが決める。`shared/color.ts`、[users.md](features/users.md)）。ログイン前は既定の色相（ブランドカラー `#A0148C` の色相）。設定画面で色を選んでいる最中は、まだ保存していない色相がテーマに入る（`src/lib/theme.ts` の `previewHue`）。secondary は使わず、強調はすべて primary で統一する。記録やユーザーを表す表示は、誰のものかをそのユーザーの色（`useUserColor` の `fill`／`mark` など）で示し、複数人のものはそれぞれの色で塗り分け、誰のものでもないものは彩度 0 の無彩色にする（`src/features/events/use-participant-colors.ts`、`src/features/users/use-user-color.ts`）。色の上の文字色は色相によらず 1 つ（`shared/color.ts` の `FILL_TEXT`）。どの画面がどこに使うかは [users.md](features/users.md) が持つ。
- ダークモード対応（`prefers-color-scheme` 追従、MUI の CSS 変数テーマで切替時のちらつきを避ける）。
- レスポンシブ: モバイルファースト。スマホでは下部ナビゲーション（BottomNavigation。ホーム／予定／立替／レモンの 4 つ。設定はホームの AppBar の歯車から開く）、PC ではサイドナビ（permanent Drawer。設定も含む。アプリ名は出さない）に切り替える。ページ自体は共通。今いる画面のタブをもう一度押したときは、項目に行き先の検索パラメータ（`NavItem` の `reselectSearch`）があればそこへ移り（カレンダーは一段広い表示へ。日→週、週・リスト→月。`src/features/calendar/view.ts` の `widerSearch`）、無ければ画面の最初の位置までなめらかにスクロールする（`src/lib/ui/initial-position.ts`。一覧が受け持たない画面は一番上）。ホーム・立替・レモンは最初の位置（ホームは一番上、立替・レモンは今日の最後の記録が画面の一番下）を画面自身が決める（ルートの `staticData.ownsScroll`）。これらの画面ではルーターのスクロール位置の復元を止め（`src/main.tsx` の `scrollRestoration`）、別の画面からでも戻る・進むでも最初の位置で出す。
- **画面の表示領域は貴重な資産**として扱う。「ホーム」「カレンダー」のような情報を持たないページタイトルは出さない（現在地はナビが示す）。同じ情報を複数箇所に出さない。主役（カレンダーのグリッド、一覧、カード）が最も広い面積を占めるようにする。
- AppBar はアプリ名の帯ではなく、そのページの操作のための帯（`AppBarContent` で Portal 経由に差し込む: カレンダーの年月と表示の切替、リスト表示・立替・レモンの検索、ユーザー登録など）。検索窓は `src/lib/ui/SearchField.tsx` を共通で使い、窓と右に並べる操作（絞り込みボタン）は1 つの塊として帯の中央に置いて最大幅で頭打ちにする（PC で帯いっぱいに伸ばすと、サイドナビの上まで窓が伸びる割に読める文字数は増えず、目とポインタの移動だけが長くなる。スマホでは帯の残り幅をすべて使う）。キーワードは画面の状態として持ち、URL の `q` は `history.replaceState` で置き換えるだけにする（`useKeywordSearch`, `src/lib/search.ts`）。ルーターで移動しないので、打った文字がそのまま同じ描画で反映され、IME の変換も途切れない。再読み込みや共有では `q` から復元する。検索窓だけで足りない画面（カレンダーのリスト表示、ホーム、立替、レモン）は検索窓の右に絞り込みボタン（`src/lib/ui/FilterButton.tsx`。ホーム・立替・レモンは窓とボタンの塊 `FilterSearchField`）を置き、AppBar の下に詳細な絞り込みのフォーム（`src/lib/ui/FilterPanel.tsx`。日付の範囲の欄は `DateRangeFilter` を共通で使う）を開く。キーワード以外の絞り込みは検索パラメータそのものを状態にし（履歴には積まず置き換える。ホーム・立替・レモンは `useFilterSearch`、スキーマは API の絞り込みのスキーマから `filterSearchSchema` で作る）、効いている条件の数はボタンのバッジに出す（範囲の上下は 1 つと数える。`countActiveFilters`）。「すべて」や空欄は絞り込まない状態として URL に残さない（入力値から絞り込みへの読み替えは `src/lib/search.ts` の `optionOrUndefined`・`dateOrUndefined`）。それ以外（アカウントメニューなど）は置かない。ログアウトとユーザー管理は設定画面。スマホでは dense（48px）。
- スマホでは main の余白を 0 にし、一覧やグリッドを画面端まで広げる（edge-to-edge）。PC のみ最小限の余白を置く。
- カレンダーの月・週・日表示は画面の残り全部を占める（AppShell が下に確保する余白は負のマージンで打ち消す）。画面いっぱいの基準は `svh`（ブラウザの URL バーなどが最大に出ている状態の高さ）で、`dvh` は URL バーの出入りで値が変わり再読み込みの直後に画面より高くなってしまうため使わない。日をタップすると日表示へ、スマホでは左右のスワイプで前後へ、年月をタップすると選択ダイアログ。前後ボタンは置かない。
- 月グリッドは Google カレンダー流: 複数日・終日の予定は週ごとに 1 本の連続したバー（レーン割り当て）、時刻付き予定は「● タイトル」（時刻は PC のみ）、タスクはチェック印付き。常にタイトルを優先し、収まらない分は「+n」でまとめる。週・日は Google カレンダーと同じタイムライン（時間軸に塗りブロック、終日欄、現在時刻の線）。
- 一覧はカードを重ねずフラットな行で並べる。日付ごとに見出し（`src/lib/ui/DateHeading.tsx`）を立て、行は左から印（色の円を重ねたベン図 `src/lib/ui/VennMark.tsx`・タスクのチェック）、揃えたい値の列、本文（上にタイトル、下に補足）の 3 列（`src/lib/ui/MarkedRow.tsx`）。カレンダーのリスト表示も立替の履歴もホームの「今日」もこの骨組みを使うので、どの一覧でも同じ順に読める（列の幅と中身は画面ごとに決める）。行の中のタスクのチェック（`TaskCheckbox`）と完了した行の見せ方（薄く・取り消し線。`completed-style.ts`）は `src/features/events/components/` に置いて共通にする。
- カレンダーのリスト表示と立替・レモンの履歴は、上が古く下が新しい無限スクロール（`src/lib/ui/InfiniteScroll.tsx`）。立替とレモンの履歴は増え続けるので全件は取らず、サーバーが新しいほうから日の途中で切らずに 1 ページずつ返す（`shared/types.ts` の `HistoryPage`）。読み足し・絞り込みの切り替え・楽観的更新の書き込みは `src/lib/history.ts`（機能ごとに `HistorySource` を 1 つ定める）、一覧の入れ物は `src/lib/ui/HistoryList.tsx`、サーバーのページ分けは `findHistoryPage` に置き、両方が使う。画面（window）そのものをスクロールし、端へ近づくと続きを足す。最初に出す位置は画面ごとに決める（リストは表示中の日を一番上、立替・レモンは今日の最後の記録を一番下。立替・レモンの未来の日付の記録はその下に続け、スクロールするまで見せない。一番下はスマホでは下部ナビのすぐ上。ナビが覆う分は `AppShell` が `html` の `scroll-padding-bottom` で宣言し、位置は `scrollIntoView` に計算させる）。絞り込みのフォームや残高・状況のタイルは一覧の上に貼り付ける（`position: sticky`）。立替の残高は下へスクロールすると隠れ、上へ戻すと出てくる（`ScrollAwayHeader`。一覧が自分で動かした分は向きに数えない）。前に足しても見ている所が動かないよう、見出しの下で最初に見えている要素（ブラウザのスクロールアンカーと同じ選び方）の位置を覚えておき、描き直した後でずれた分だけ戻す。ブラウザのスクロールアンカー（`overflow-anchor`）は Safari が対応していないので使わず、二重にずれないよう止めている。 ホームのタイムラインだけは上が新しく下が古い（最新を先に見たい画面なので）。足すのはいつも下なので見ている所を保つ仕掛けは要らず、端の見張り（`src/lib/ui/use-edge-observer.ts`）とページ（`useHistory`）だけを共有する。
- 一覧の行には削除などの操作ボタンを置かず、行をタップして開く詳細（`ItemDetailSheet` / `ExpenseDetailSheet` / `CareLogDetailSheet` / `MemoDetailSheet`）に操作を集める。行の主役は内容で、破壊的な操作を目立たせないため。行に残す操作はタスクの完了チェックだけ（1 タップで済ませたい主操作で、取り消しもできる）。
- 記録 1 件を出す入れ物は `RecordSheet` 1 つに揃える（スマホでは下から出るシート = `BottomSheet`、PC では中央のダイアログ）。追加のフォームも、行をタップして開く詳細も、その詳細からの編集も同じ入れ物で、違うのは中身と三点リーダーに並ぶ操作だけ。予定・タスク・立替・レモンのどれも同じ手順で読み・直し・消せる。
- 詳細は読むだけで開き、鉛筆を押す（スマホなら上へスワイプする）と同じ入れ物の中が入力欄に変わってその高さまで広がる（別のダイアログを重ねない）。操作は上端の帯に集める: 左に閉じる（バツ）、右に鉛筆（編集中・追加中は保存）と三点リーダー（複製、削除、タスクの完了）。シートがどこまで下がっていても上端だけは見えているので、主な操作はそこに置く。帯（`SheetHeader`）は予定のクイック入力も使う。
- 見出しを出すのは**閲覧のときだけ**で、そこには対象物の名前（予定のタイトル、立替の内容、世話の種別）を出す。**追加・編集**も、**選ぶだけのダイアログ**（年月の選択、繰り返しの範囲）も見出しは置かない。何をする場かは入力欄や選択肢そのものが示すので、帯は操作（閉じる・保存）だけにする。読み上げ用の名前はどの場合も持つ（`RecordSheet` の `title`、ダイアログの `aria-label`）。名前は「年月の選択」「繰り返しの編集」のように何の場かを指す名詞にする（ボタンの文言「年月を選ぶ」とは言い回しが違う）。
- 中身の余白は Material 3 に合わせる。PC のダイアログは四辺 24px（M3 のダイアログの仕様。アイコンボタンは字面が揃うよう 8px ぶん詰める）、スマホのシートは画面の端まで使うので 16px。
- 項目が多いフォーム（予定・タスク・ユーザーの登録）は同じ `RecordSheet` を `full` で出す。スマホでは最初から画面いっぱいのシート、PC では少し広いダイアログ。下へスワイプすればそのまま取り消せる（タスク・ユーザー）。
- **単押しは閲覧、長押しは編集**（どの画面でも同じ）。記録 1 件を出す行・帯は、軽く押せば読むだけの詳細、長押しすればそのまま編集で開く（`src/lib/ui/use-record-press.ts` の `useRecordPress`。長押しの区切り 300ms と指のぶれ 8px はここが 1 か所で持ち、カレンダーのドラッグ（`use-range-drag.ts`）も同じ値を使う）。閲覧と編集は同じ `RecordSheet` の 2 つの顔なので、押した指の長さがそのまま開き方になり、読むだけで開いてからでも鉛筆・上へのスワイプで編集に移れる。長押しを見るのはタッチだけで、マウス・ペンは鉛筆から入る。カレンダーのグリッド（月・週・日）では長押しの編集が「つまんで動かす」ことそのもの（[features/calendar.md](features/calendar.md)）で、シートは開かない。タッチの click は指を離した所にあるものへ向かうので、長押しで開いた直後の click は 1 回だけ文書全体で飲む（開いたばかりのシートの後ろの覆いが押されて閉じてしまわないように）。
- 記録のシート（追加・詳細・編集）で開いた瞬間に入力欄へ焦点を当てるのは、次に何を打つつもりかが確実に分かるときだけ。分からないのに当てると、使う人が選ぶより先に入力欄を決めてしまう。
  - 当てる: タスクの追加（`ItemForm`）と予定の追加ボタンからの入力（`QuickEventForm`）はタイトル（必ず入れる）、メモの追加（`MemoForm`）と編集（`MemoDetailSheet`）は本文（項目が本文だけ）。予定のクイック入力は、PC の吹き出しならグリッドをなぞって開いたときもタイトルに当てる（タイトルだけの小さな入れ物なので）。
  - 当てない: 項目の多い記録（タスク・予定・立替・レモン）の編集は、どの項目を直すつもりか分からない。スマホでグリッドをなぞって開いた予定の入力は、まだ日時を選び直しているかもしれない。
- 保存を押したら送信の完了を待たずに閉じる（結果は楽観的更新で即座に画面に出る）。閉じるのはマウントごとで、保存を押した瞬間から画面は保存後とまったく同じになる（カレンダーの下書きの枠やつまむ所も残らない）。失敗したら画面を送信前へ戻し、理由を画面下部の通知で伝える。入力したまま開き直すことはしない: 開き直せるようにフォームを隠して残すと、返事が来るまで入力の名残が画面に残るため（クライアントでもサーバーと同じスキーマで検証するので、断られるのは稀）。例外はサーバーの結果が無いと何も出せない書き込み（ログイン、ユーザーの登録・変更、配信 URL。`queue: false`）で、返事を待ち、失敗したら入力したまま開き直して理由をフォームの先頭に出す。
- 下から出るシート（`src/lib/ui/BottomSheet.tsx`）は `translateY` だけで見える量を変え、止まる位置は中身の実測から決める。下へなぞって下げきると閉じる。仕組みは 3 つに分かれ、指への追従は `use-sheet-drag.ts`（止まる位置を知らず、動いた量だけを返す）、高さの実測は `use-sheet-size.ts`、どの段で止まるかは `BottomSheet` が決める。なぞり始める場所は選ばない（入力欄やボタンの上も含む。つまむ帯だけでは狭すぎる）。縦に少し（8px）動かすまではシートを動かさないので、タップや文字の選択は今までどおり中身に届き、そこで指を捕まえるので押したことにはならない。中身のスクロールもシートが面倒を見て、指の下がまだスクロールできるならそちらを先に動かす（ブラウザ任せ（`touch-action: pan-y`）にすると、スクロールできない所でもなぞりを取り上げられてシートを動かせない）。`peekRef` を渡すと上・下の 2 段で止まり（カレンダーのクイック入力）、常に画面いっぱいの高さで、後ろを触れるようモーダルにしない。渡さなければ段は 1 つで、中身の高さのまま画面の下に出し（画面いっぱいが上限）、後ろは暗くして触れなくする。項目が少ないフォームほど入力欄も操作も指の届く下半分に集まり、後ろの一覧も見えたままになる。
- ダイアログ（`src/lib/ui/Dialog.tsx`）は開いている間だけ履歴に項目を 1 つ持つ（`useDialogHistory`）。戻る操作（ブラウザバック、iOS の画面端のスワイプ）は重なったダイアログを閉じるだけで、後ろのページまで戻らない。開いている物（選んだ項目、入力途中の値）は URL で表せないので、URL ではなく history の state に「開いているダイアログの数」だけを書く。画面の操作で閉じたときは積んだ項目を戻すので、履歴に抜け殻は残らない。閉じるのは戻る操作のときだけで、新しく積む移動では閉じない（カレンダーは予定を入力しながら月・週・日を切り替えられる。別の画面へ移るときはダイアログごとマウントが終わる）。ダイアログの中から画面を移る操作（年月の選択）は replace で行う（push すると、戻ったときに中身のないダイアログの項目を踏む）。MUI の Dialog と、同じく重ねて開く Modal・Popover・Drawer を部品や画面から直接使うことは biome が禁じる。使ってよいのは履歴を自分で持つ `lib/ui` の入れ物（`Dialog`・`BottomSheet`・`AppShell` の常設の Drawer）だけ。PC のクイック入力の吹き出し（`QuickForm`）は重ねて開くがモーダルにしない（開いたまま後ろの枠をつまめるように）ので Popper を使い、`useDialogHistory` を自分で呼ぶ。
- 入力は極力少ないタップで完了させる（ホームのクイック追加、既定値の自動入力、日付は今日を初期値）。
- 更新系は TanStack Query の mutation（`useOptimisticMutation`）で行う。送信と同時にサーバーが返すはずの値をキャッシュへ書き、失敗したら書き込み前へ戻す。送信が終われば関連クエリを invalidate してサーバーの値に合わせる（再取得の完了は待たない）。待つと操作の結果が回線の速さに左右され、切れれば永遠に出ない。フォームは送り始めた時点（オフラインなら端末に溜めた時点）で保存できたものとして扱って閉じる。
- 失敗を伝える場所は 1 つにする。返事を待つフォーム（`queue: false`）は開き直したフォームの中に、それ以外（楽観的に保存したフォーム・削除・完了・色の変更）は画面下部の通知（Snackbar。`lib/ui/notice.ts`）に出す。
- 楽観的更新に必要な計算は `shared/` の共通コードで行い、クライアントで別実装しない。繰り返しの展開だけはサーバーにしか無いので、投機的に出すのは操作した回だけ（残りの回は再取得で揃う）。
- 移動は何も待たせない。タップした瞬間に画面を切り替え、まだ無いものは骨組み（MUI の Skeleton。`src/lib/ui/QueryView.tsx`）で示す。ページのコードを読み込む間も前の画面には留めない（`defaultPendingMs: 0` と `defaultPendingComponent`）。待つのは操作の結果ではなく内容の到着なので、待ち時間は移動の後に置く。
- クエリの状態は `QueryView`（`src/lib/ui/QueryView.tsx`）が 1 か所で描き分ける: 手元にデータがあれば取り直し中でも失敗してもそれを出し、まだ無ければ骨組み、無くて失敗しているなら理由を出す。一覧の骨組みは `ListSkeleton`。
- 待っていることを伝えるのは、手元に何も出せないときだけにする。画面上部の細いインジケータ（`AppShell` の `TopProgress`）が数えるのはデータを持たないクエリの取得だけで、キャッシュを出しながらの取り直しと書き込みは数えない（`useIsLoadingWithoutCache`。理由は `src/lib/query-client.ts`）。どの画面もマウントのたびに裏で取り直すので、それを数えると移動のたびに毎回インジケータが出て、内容は最初から出ているのに遅く見える。
- 画面が変わる移動は View Transition（`src/main.tsx` の `defaultViewTransition`）で繋ぐ。前後の画面に共通して在るもの（カレンダーの表示を切り替えたときの同じ予定、レモンのタイル）には同じ `view-transition-name` を付けてあり、その場から新しい位置へ動く。名前の無いものはブラウザ既定のフェード。アニメーションの記述は持たず、名前を付けるだけにする。画面が変わるのはパスが変わるときと、カレンダーの表示（月・週・日・リスト）が変わるときで、同じ画面の中の更新（スワイプでの前後移動、絞り込み、検索キーワード）では使わない（指やキーに合わせて出る所なので、そのたびに画面全体がフェードすると却って遅く見える）。判定は戻る・進むを含めどの経路でも同じになるよう router に 1 か所だけ置く。
- `view-transition-name` は文書の中で一意でなければならず、重複すると遷移そのものが行われない。同じ項目が複数描かれる所（複数日の予定、スワイプの控えの面）の扱いは [features/calendar.md](features/calendar.md) と `src/lib/theme.ts` を参照。
- フォント: システムフォント（`system-ui`）。Web フォントは読み込まない。OS の UI と同じ字面になり、待ち時間も文字の入れ替わりも起きない。
- **ブラウザではなくアプリとして触れるようにする**（`src/lib/theme.ts` の `MuiCssBaseline`）。すべて `body` / `html` に 1 か所だけ置き、個々の部品には書かない:
  - `touch-action: pan-x pan-y`: ブラウザの拡大縮小はしない。素早く続けて押しても（日を次々に選ぶ、電卓を叩く）、つまんでも画面は動かない。つまむ操作はアプリ側で使う（カレンダーの週・日表示で時間軸を縦に伸び縮みさせる。[features/calendar.md](features/calendar.md)）ので、ブラウザに取られると効かなくなる。
  - なぞっている間だけタッチの既定の動きを取り上げるのは JS 側（`src/lib/ui/touch-block.ts` の `blockTouchMove`）。掴んでいる間しか付けないので、普段のスクロールはブラウザの速い経路（passive）のまま。
  - `-webkit-tap-highlight-color: transparent`: 押したときの灰色の四角を出さない。押した手応えは MUI の ripple が示す。
  - `user-select: none` と `-webkit-touch-callout: none`: 長押ししても文字が選ばれたり、画像・リンクのメニューが出たりしない。選んで写せるのは入力欄（`input, textarea`）だけにする。読むだけの画面の文字も、鉛筆を押せば同じ場所が入力欄に変わるので、写したいときはそこから選べる。
- 引っ張って更新はアプリが自前で持つ（`src/lib/ui/PullToRefresh.tsx` と `use-pull-to-refresh.ts`）。一覧やカレンダーでは「最新にしたい」に素直に応える動きだから。ブラウザのものは使わない。iOS のホーム画面の Web アプリにはそもそも無く、Android では印が AppBar の上に重なるため。`PullToRefresh` が `html` に `overscroll-behavior-y: contain` を当ててブラウザのものを止め（none にしないのは、端で跳ね返る・光る動きは残すため）、代わりにタッチを見て距離を数え、印を AppBar の裏から下へ出す。引き切って離すと、いま画面に出ているデータ（有効なクエリ）を取り直し、終わるまで印が回る。ページは読み込み直さない。画面の状態（下書き、開いているダイアログ、入力途中の文字、スクロール位置）を残すためで、読み込み直しても PWA では版が変わらない（下の「手動更新」）ので得る物も無い。オフラインと分かっている間（案内の帯が出ている間）は引けない（取得はオフラインの間は保留されるので、取り直しを待つと印が回り続ける）。取り直しが失敗したときは「更新できませんでした」を 3 秒だけ知らせる。オフラインと分からないまま繋がっていないとき（Wi-Fi には繋がっているが外に出られない、など）もここで分かる。
  - 無限スクロールの一覧では、引ける端は続きを読み足す端の逆の端だけ（`use-pull-to-refresh.ts` の `allowedEdges`）。上へ読み足す立替・レモン・天気は下端から上へ、下へ読み足すホームは上端から下へ引き、上下どちらにも読み足す予定のリストは引けない。同じ端に 2 つの働きを持たせると、続きを読むつもりで取り直しが起きたり、取り直すつもりで続きが読まれたりして、指の動きから結果が読めなくなるため。一覧ごとに端を選ばせず、読み足す端から決める。読み足す端は、端の見張り（`useEdgeObserver`）が見張りの要素に付ける印（`data-loads-at`）で知る。印を見張りそのものに持たせるので、無限スクロールの一覧を作れば必ず付き、付け忘れられない。読み込み中・読み切った後も印は残し（続きを読む物は null）、引ける端が読み込みのたびに変わらないようにする。無限スクロールの無い画面は上端から引く。
  - 引けるのはページの端（上端から引くなら一番上、下端から引くなら一番下）で、指の下に途中までスクロールした所が無いときだけ（カレンダーの時間軸を上へ戻している最中に化けない）。なぞりを自分で扱う所（`touch-action` が下向きの移動を許していない。2 段のシートや予定のつまみ）からも引けない。ブラウザもそこではページを動かさないので、その宣言に揃える。ダイアログや段を持たないシートは body に出てアプリの枠の外なので、これらを下へなぞって閉じる操作は引いたことにならない。誰かが取り上げたなぞり（`blockTouchMove`）と 2 本指も数えない。タッチは passive で見るだけにして、スクロールを遅くしない。
  - 止めるのは設定とユーザー管理だけ。どちらも引いて取り直したい内容を持たず、上端に指で動かす操作（色のスライダー）や入力があるので、それらを触ったつもりの指で取り直しが起きないようにする。止めたい画面はルートの `staticData: { noPullToRefresh: true }` で宣言する（型は `use-pull-to-refresh.ts` の `StaticDataRouteOption`）。画面を移れば自然に外れるので後片付けが要らない。

## PWA

- Web App Manifest（`name: LifeHub`, `display: standalone`, アイコン 192/512/maskable）。`theme_color` / `background_color` は指定しない。manifest の色は 1 色しか持てず、ライト／ダークを切り替えられないため。
- ショートカット（manifest の `shortcuts`。ホーム画面のアイコンの長押し、タスクバーの右クリックから開く）: 一覧は `src/lib/shortcuts.ts` に 1 つだけ置き、manifest（`vite.config.ts`）とアイコンの生成が同じ物を読む。入力を開くものは URL のしるし（`add`）で始め、受けた画面が開くと同時にしるしを消す（スキーマも消す処理も `src/lib/add-search.ts`。開いている入力は画面の状態で、URL に残す物ではない）。しるしを受ける画面と開ける種類は `src/lib/add-pages.ts` の表 1 つで、画面の検索スキーマもショートカットの URL（`addUrl`）もそこから作るので、画面が受け取れない種類をショートカットに書くと型で止まる。しるしは予定・立替・レモンの各機能が読むので、どの機能にも属さない `src/lib` に置く（`features/add` は機能のフォームを読むので、機能から `features/add` を読むと輪になる）。しるしが開くのは追加ボタンが開くのと同じ入力（同じ状態）で、ショートカット専用の道は作らない。
- ステータスバー（スマホ）とタイトルバー（PC）の色は、メディアクエリ付きの `theme-color` メタで配色ごとに渡す。値はアプリの面の色そのもの（`shared/color.ts` の `SURFACE`）で、AppBar と地続きに見える。テーマと二重管理にならないよう、index.html には直接書かず `vite.config.ts` の `themeColorMeta` が注入する。
- iOS 向け: `apple-mobile-web-app-*` メタ、`apple-touch-icon`。ステータスバーは `default`（iOS がページの背景色に合わせて塗り、文字色も選ぶ）。
- Service Worker（`vite-plugin-pwa`, `injectManifest` 方式で `src/sw.ts` を自前管理）: precache、`push` / `notificationclick` の処理。`registerType: 'autoUpdate'`（`skipWaiting` + `clientsClaim`）。
- 手動更新: 設定画面の「バージョン」の右の更新ボタン（`src/lib/update.ts`）。インストールした PWA は precache から起動するため再読み込みでは版が変わらないので、`registration.update()` で Service Worker を取りに行き直す。新版が見つかれば、それが有効になった時点で上記 `autoUpdate` の経路が読み込み直す。新版が無いときと、取りに行けなかったとき（オフライン等）だけ自分で読み込み直す（押しても何も起きない状態を作らない）。
- アイコンは `public/icons/favicon.svg`（アプリのアイコン）、`public/icons/badge.svg`（通知の小さな印）、アプリが使っている MUI のアイコン（ショートカット）を元に `pnpm icons:generate`（Playwright の Chromium でラスタライズ）で生成し、生成物をコミットする。画像ライブラリを増やさないため。ショートカットの絵は、アプリが使っている MUI のアイコン（下部ナビと追加ボタンのもの）を React からそのまま描き出し、アプリのアイコンと同じ角丸の板に白で置く。絵の選択も path も書き写さないので、アプリの表示とショートカットが必ず同じ絵になる。

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

**毎日 JST 4:00（`backup.yml`）**: `terraform output` の `DATABASE_URL` に対して `pnpm db:dump`（`pg_dump`）と `pnpm calendar:export`（全員の全予定の ics）を実行し、Artifact `backup-<JST の日付>` に 30 日保持で置く。ランナーの Postgres クライアントは本番（Neon）より古いので、PGDG から同じメジャーバージョンを入れて使う。private リポジトリの Artifact はリポジトリを読める人しか取り出せないので暗号化はしない。戻し方は [README](../README.md#バックアップ)。

**main へのプッシュ（`deploy.yml`）**: `terraform apply -auto-approve` → `drizzle-kit migrate`（`DATABASE_URL` は `terraform output`）→ `pnpm data:refresh`（祝日と天気を表に入れる。[features/calendar.md](features/calendar.md#祝日)。失敗してもデプロイは続ける）→ `vercel pull --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod`。

Preview 環境の挙動:
- Preview の環境変数は Terraform（target = `preview`）で管理し、`DATABASE_URL` だけをデプロイ時に PR ブランチの値で上書きする。
- `VERCEL_ENV !== 'production'` のとき、日次 Cron の通知予約と QStash への publish を無効化する（Preview から本番と同じ通知が二重に飛ぶのを防ぐ）。配信コールバックの署名検証は Preview でも行う。
- better-auth の `baseURL` は、`APP_URL` があればそれに固定し、無ければ（= Preview）`VERCEL_URL`・`VERCEL_BRANCH_URL` のホストに限ってリクエストのホストから決める。Preview は URL がデプロイごとに変わるため、固定値では origin チェックに落ちてログインできない。この 2 つは Vercel のシステム環境変数なので、プロジェクト設定の公開（`automatically_expose_system_environment_variables`）が前提になる。

運用上の注意:
- マイグレーションは後方互換を保つ（列削除は「アプリが参照をやめたデプロイ」の次のデプロイで行う）。
- ロールバックはアプリ側は `vercel rollback`、インフラ側は Terraform の変更を revert してプッシュ。
- バックアップは Neon の PITR（直近 6 時間）と、日次の `backup.yml`（上記のデプロイフロー）の 2 段。PITR は直前の誤操作を戻すため、日次のダンプはそれより前の状態と、Neon そのものが使えなくなったときのため。
- 無料枠の制約: Vercel Hobby は Cron の式 1 つにつき日次まで（時は最大 59 分ずれる）・関数実行時間に上限・非商用限定、Neon Free はコンピュート自動停止・ストレージ上限、QStash Free は 1 日 1,000 メッセージ・遅延最大 7 日。

## 品質基準

- TypeScript `strict: true`、`any` 禁止、`noUncheckedIndexedAccess: true`。
- Biome で lint/format を、knip で未使用のファイル・export・依存の検出を CI で強制（`pnpm lint`）。警告ゼロを維持。
- import の循環は Biome の `noImportCycles` が禁じる（型だけの import は数えない）。循環はどれかのモジュールが読み込みの時点で相手を使う形に変わった途端に初期化の順序で壊れ、原因が import の順に隠れて見つけにくいため。止められたら、互いに呼び合う片方の読み出しを依存の少ない側（例: 終日の通知時刻は `features/notifications/repository.ts`）へ移す。
- `.tsx` はコンポーネントだけを export する（Biome の `useComponentExportOnlyModules`）。定数・関数は隣の `.ts` に置く（例: `lib/ui/layout.ts`、`features/expenses/format.ts`）。Vite の Fast Refresh はコンポーネントだけの module でしか効かず、混ぜると編集のたびに画面ごと読み直しになるため。ルートの file（`Route` を export し、コンポーネントは router の `autoCodeSplitting` が別の module に切り出す）と `main.tsx`（入口）は対象外。
- 1 file は 400 行、1 関数は 100 行まで（Biome の `noExcessiveLinesPerFile`・`noExcessiveLinesPerFunction`）。file の上限はテスト（`__tests__/`・`e2e/`）にも同じ値を掛ける。関数は中央値が 1 桁、99% が 100 行未満に収まるので、それを超える関数は責務を 2 つ以上抱えているとみなす。超えたら上限を上げずに、状態と操作はフック（`use-*.ts`）へ、表示は小さな部品へ、React に依らない仕組みは素の TS へと、関心ごとに分ける。テストが長くなったら、確かめる関心ごと（対象の関数の群れ、画面の操作の種類）で file を分け、共有する準備と略記は隣の補助 file（例: `e2e/calendar-mobile.ts`、`__tests__/draft-fixtures.ts`）に置く。テスト全体で使う物は 1 か所に置いて書き写さない: 日時を JST で書く略記（`jst` / `iso`）は `shared/__tests__/jst.ts`、サーバーのテストのユーザー（自分 A と相手 B）は `server/lib/db/test-db.ts` の `createTestUser`、ログインして Cookie を得る手順は `server/__tests__/login.ts`（`signIn` / `cookieOf` / `loginAs`）。E2E はログイン済みの状態から始まり（`e2e/auth.setup.ts` が 1 度だけログインして保存する）、ログインしていない状態・ホームを開く手順は `e2e/auth.ts`（`SIGNED_OUT` / `openHome`）、確かめる操作の前に予定や記録を置く手順は `e2e/events.ts`（`addItem`）と `e2e/history.ts`（`addRecord` / `postRecord`）。テストでは関数の行数を数えない。`describe`・`test` のコールバックは場合を並べる入れ物で、長さが処理の複雑さを表さないため。
- テスト: Service 層（特に繰り返し展開・残高計算・通知列挙）はユニットテスト必須。主要導線（ログイン → 記録追加 → ホーム反映）は E2E。
- Terraform も品質基準の対象: `terraform fmt -check` と `terraform validate` を CI で強制する。
- コミットは Conventional Commits。PR 単位で機能を追加する。
- 依存の更新は Dependabot（`.github/dependabot.yml`）が npm のみ・週次・まとめて 1 PR で提案し、マージは人が判断する。GitHub Actions と Terraform は対象外（プロバイダ更新はリソース再作成の事故を避けるため、バージョン制約を編集する PR で行う）。
- npm パッケージは公開から 3 日以上経ったものだけを取り込む。乗っ取られたアカウントからの publish が発覚・取り下げされるまでの猶予を取り、サプライチェーン攻撃を避けるため。Dependabot は pnpm の設定を読まない別の解決系なので、経路ごとに同じ猶予を書く: pnpm は `pnpm-workspace.yaml` の `minimumReleaseAge: 4320`（分）、Dependabot は `.github/dependabot.yml` の `cooldown.default-days: 3`。
- この猶予が効かない経路が 2 つある: CI の `pnpm install --frozen-lockfile` は解決済みのロックファイルをそのまま入れるので再検査しない。Dependabot の security updates は仕様上 cooldown の対象外で、即座に PR が作られる。
