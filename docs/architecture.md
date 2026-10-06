# アーキテクチャ

LifeHub のソフトウェアとしての設計（技術の選定、層と依存の向き、ディレクトリ構成、データの流れ）と、その判断の理由。すべての判断は [AGENTS.md](../AGENTS.md) の理念（シンプル至上主義・Web 標準優先・保守性 > 短さ）に従う。

画面の見た目と操作の約束事は [ui.md](ui.md)、インフラ・デプロイ・監視は [operations.md](operations.md)、コードの規約・テスト・依存の取り込みは [development.md](development.md) に書く。

## 前提

- 利用者は 2 人、データ量は小規模。スケーラビリティよりも単純さと正しさを優先する。
- 少人数がヘビーに使うため、初回ロードより **2 回目以降の起動速度とオフライン閲覧** を重視する。
- インフラはすべて無料枠（Vercel Hobby / Neon Free / Upstash QStash Free / HCP Terraform Free / Sentry Developer）。
- ブラウザ互換性は考慮しない。最新の Chrome と Safari（iOS 含む）のみを対象とし、ポリフィルを入れない。
- 業務ロジックはサーバー（Hono）に置く。クライアントは表示と入力に徹し、UI と MCP と通知処理が同じ Service 層を共有する。

## 技術スタック

| 領域 | 採用 | 理由 |
|---|---|---|
| ホスティング | Vercel（Hobby） | 外部 DNS からの CNAME だけで独自ドメインを割り当てられる。静的配信と Serverless Function を 1 プロジェクトで扱える。無料・カード不要。 |
| フロントエンド | React + TypeScript（strict）、Vite ビルドの SPA | オフライン対応と積極的キャッシュを単純に実現するため、SSR ではなく静的なアプリシェルにする。 |
| ルーティング | TanStack Router（ファイルベース） | 型安全なルート・検索パラメータ。TanStack Query と統合できる。 |
| データ取得・キャッシュ | TanStack Query + `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister`（ストレージは `idb-keyval` で IndexedDB） | サーバー状態の標準的な管理。永続化によりオフライン閲覧と即時起動を実現する。 |
| バックエンド | Hono（Vercel Function 1 つ、Node ランタイム） | `api/index.ts` が `server/app.ts` の Hono アプリを Sentry で包んで default export する（Vercel の Node ランタイムは `fetch` を持つオブジェクトを Web 標準ハンドラとして扱う。包み方は [operations.md](operations.md#監視sentry)）。1 関数にまとめることで Hobby の関数数上限を気にしなくてよい。 |
| DB | Neon（Postgres, Free）。Terraform で直接管理（Vercel Marketplace 連携は使わない） | アイドル時のコンピュート停止によるコールドスタートは、起動時にキャッシュから描画する設計で吸収する。 |
| DB ドライバ / ORM | `@neondatabase/serverless`（HTTP）+ Drizzle ORM + drizzle-kit | サーバーレスに適した接続方式。スキーマが TypeScript で単一情報源。HTTP ドライバで往復を増やさない読み書きのまとめ方は [通信の往復](#通信の往復)。ローカル／テストは `drizzle-orm/node-postgres`（`server/lib/db/client.ts` で `VERCEL` 環境変数により切替）。 |
| ランタイム | Node.js 最新 LTS（`.node-version` と `package.json#engines` で固定） | Vercel Function と CI で同じバージョンを使う。 |
| 画面の API | tRPC（`@trpc/server` / `@trpc/client`） | 画面専用の API を手続き（procedure）として書き、クライアントに型が伝わる。同じ時点に出た呼び出しを `httpBatchLink` が 1 本の要求にまとめ、サーバーはその中の手続きを並べて実行する（[通信の往復](#通信の往復)）。外と約束した口（better-auth・MCP・ics の配信・記録投入・Cron・QStash）は Hono のまま。 |
| バリデーション | Zod（`shared/validation/`）+ `@hono/zod-validator`（Hono のまま残る口） | クライアントのフォームと API の入力を同じスキーマで検証する。MCP ツールの引数は LLM に合わせて別に形を決め（下記「レイヤー構成」）、項目の定義がそのまま使えるときだけ共有する。 |
| 認証 | better-auth（メール＋パスワード、Drizzle アダプタ） | Hono 対応。MCP 向け OAuth 2.1 プラグインを持つ。 |
| MCP サーバー | `@modelcontextprotocol/server`（v2）の `createMcpHandler`、Streamable HTTP（ステートレス） | 同じ Hono アプリに載せる。MCP 2026-07-28（要求ごとに完結する版）と 2025 年版の両方を 1 つの口で受ける。サーバーレスのためセッションを持たない。 |
| 繰り返しルール | RFC 5545 RRULE（`rrule` ライブラリ） | 予定・タスクで同じ仕組みを使う。展開ロジックを自作しない。 |
| プッシュ通知 | Web Push（VAPID）、`web-push` | ブラウザ標準。iOS はホーム画面に追加した PWA で対応。 |
| 通知スケジューラ | Vercel Cron（日次）+ Upstash QStash（Free） | Hobby の Cron は分単位では呼べない（呼べる頻度は [Cron の決まり](#ディレクトリ構成機能単位で凝集)）ので、分単位の配信は QStash の遅延配信で行う。 |
| UI | MUI（Material UI） | マテリアルデザインを「書かずに」得る。 |
| カレンダー UI | 自作の月／週グリッド（MUI 部品で構成）。日時の入力は `<input type="date">` / `<input type="time">`（MUI の TextField 経由。予定・タスクの日時は日付と時刻の欄に分ける）。記録の日時（レモンの世話）は `<input type="datetime-local">` | 汎用カレンダーライブラリは要件に対して過剰で見た目の統一が難しい。日時入力は Web 標準で足り、スマホではネイティブのピッカーが使える。MUI X Date Pickers は date-fns アダプタがタイムゾーン非対応のため採用しない。 |
| フォーム | React 標準（`<form>` + `FormData`）+ Zod | フォームライブラリは入れない。 |
| 日付 | `Intl.DateTimeFormat` で表示、計算は date-fns（`@date-fns/tz`）。date-fns を読むのは日時の変換の部品（`shared/date.ts`・`src/lib/date.ts`・`server/lib/mcp/time.ts`）だけで、ほかは `shared/date.ts` の関数を通す（`lint/date-fns.grit` が強制する） | 表示は Web 標準で足りる。JST の暦日での計算はタイムゾーンを扱えるライブラリに任せ、自作しない。date-fns の計算を Date にそのまま掛けると実行環境のタイムゾーンの暦で計算され、夏時間のあるタイムゾーンでは 1 日が 24 時間にならない日がある。 |
| PWA | `vite-plugin-pwa`（Workbox, `injectManifest`）+ Web App Manifest | アプリシェルの precache、Service Worker での push / notificationclick 処理。 |
| テスト | Vitest（クライアント: jsdom、共有（shared）とサーバー: Node。3 つを別のプロジェクトにし、DB を使うのはサーバーだけ）+ Playwright（E2E） | サーバーのテストと E2E は `compose.yaml` の Postgres に対して実行する。E2E は `vite build` した成果物と `server/dev.ts` を起動して行う。 |
| Lint / Format | Biome | 単一ツールで完結し設定量が少ない。 |
| IaC | Terraform（`vercel/vercel`, `kislerdm/neon`, `jianyuan/sentry`, `hashicorp/random`）+ HCP Terraform（Free）をリモート state に使用 | Vercel・Neon・Sentry の全設定をコードとして確認・編集できるようにする。 |
| CI/CD | GitHub Actions。main へのプッシュで Terraform apply → DB マイグレーション → Vercel 本番デプロイ | Vercel の Git 連携（自動デプロイ）は使わない。順序を 1 つのワークフローで保証するため。 |
| 監視 | Sentry（Developer = 無料）。`@sentry/react`（ブラウザ）+ `@sentry/hono`（サーバー。`@sentry/node` の上に Hono のルート名とミドルウェアのスパンを足す） | 2 人しか使わないので、利用者が気づいて報告するより先に不具合を知る手段が要る。エラー・トレース・ログ・死活監視を 1 つの無料のサービスで賄え、ブラウザとサーバーを 1 本のトレースで繋げる（[operations.md](operations.md#監視sentry)）。 |
| パッケージ管理 | pnpm | 高速・厳格。 |

## レイヤー構成

```
[クライアント: React SPA（静的配信）]
  features/*/queries.ts ──(tRPC client)──────┐
                                             ▼
[Vercel Function: Hono + tRPC]    routes.ts（手続き: Zod 検証 → Service を呼ぶ薄い層）
  MCP tools (mcp.ts) ────────────────────────┤
  Cron（/api/cron/*）/ QStash（/api/qstash/*）─┤
                                             ▼
                                      Service 層 ──→ Repository 層 (Drizzle) ──→ Neon Postgres
                                             ▲
                              shared/ の Zod スキーマ・型（両者で共有）
```

- UI・MCP・通知処理は同じ Service 層を呼ぶ。業務ロジックを複数箇所に書かない。
- tRPC の手続き・Hono のルート・MCP ツールは「入力を Zod で検証して Service を呼ぶ薄い層」に留める。
- **MCP ツールは API ではなく LLM 向けのインターフェース**として作る。REST API は自分のクライアントだけが呼ぶ内部の口で、型の厳密さ（判別共用体、省略させない項目）を優先してよい。MCP ツールは LLM が説明を読んで正しく呼べることを最優先にし、API の形をなぞらない（例: 入力の最上位は平らなオブジェクトにし、`anyOf` にしない。考えなくてよい項目は省略させ、既定を置く。組み合わせの誤りは何を足せばよいかの文で返す）。LLM の入力を Service の入力に直すのは `mcp.ts` の役目。API の変更に合わせて MCP の形を変える必要は無く、逆も同じ。
- Repository 層は Drizzle クエリのみ。ビジネスルールを持たない。
- 層と依存の向きは Biome の `noRestrictedImports`（`biome.json` の overrides）で強制する。
  - サーバー: `repository.ts`・`schema.ts` と DB の土台（`lib/db/`。接続・全表の集約・repository が使う問い合わせの部品・better-auth のアダプタ・ヘルスチェック・テストの DB）を除いて、`lib/db/` と `drizzle-orm` を import できない。例外は `lib/db/auth-adapter.ts` と `lib/db/health.ts` だけで、`lib/db/` に足したファイルは既定で外から読めない。自分の `./repository.ts` 以外の repository も読めない（他の feature のデータはその feature の service を通す）。`routes.ts` / `mcp.ts` は自分の feature の repository も読めない。入力の検証は、tRPC の手続きは `.input`、MCP ツールは `inputSchema`、Hono の口は `lib/validator.ts` の `validate` で行う（`@hono/zod-validator` は使わない）。`lib/` は features を読まない（DB の表の定義 `features/*/schema.ts` だけは、全表の集約（`lib/db/schema.ts`）と DB の土台のために読める）。feature を組み立てるのは `server/` 直下の入口（`app.ts`・`cron.ts`・`qstash.ts`・`mcp.ts`）だけ。
  - クライアント: API（`lib/api.ts`）を呼べるのは `features/*/queries.ts` と `lib/` だけ。`lib/` は `features/` を読まない。events は calendar を読まない（予定・タスクのデータは events が持ち、依存は calendar → events の一方向）。重ねて開く MUI の部品（Dialog など）を直接使うことの禁止は [ui.md](ui.md#ダイアログと履歴)。
  - 置き場所の間: `shared/` は `server/` も `src/` も読まない。`server/` は `src/` を読まない。`src/` は `server/` を読まない（API の型だけは `src/lib/api.ts` が `server/app.ts` の `AppRouter` を `import type` で読む。Biome の規則は型だけの import を見分けないので、`api.ts` には `server/app.ts` だけを許す規則を掛け、それ以外のサーバーのコードは読めないままにしている）。
  - Biome の override は、同じ規則の options を足し合わせず後の物で置き換える。そこで import の規則の override は「どのファイルもどれか 1 つの組み合わせに当たる」ように分け、各 override にそのファイルに掛かる禁止をすべて書く（禁止の文言が override の間で重なるのはこのため）。規則を足すときは、その規則が掛かるファイルを含む override すべてに足す。
  - WHY NOT dependency-cruiser（規則を足し合わせられ、型だけの import も見分けられる）: TypeScript 7 は JS のコンパイラ API を持たず、dependency-cruiser が TS を読めない。
- クライアントは Service 層の結果を表示し、入力を送るだけ。計算（精算・繰り返し展開・タスクの表示位置）をクライアントで再実装しない。楽観的更新（下記）でクライアントも同じ結果を先に出す必要があるものは、再実装ではなく `shared/` に置いて両方が同じコードを使う（`calendar.ts` = 暦日への割り当てと並び、`expenses.ts` = 精算、`lemon.ts` = 世話の状態、`memos.ts` = ピン止めの並び、`timeline.ts` = タイムラインの行と日時）。繰り返しの展開だけはサーバーにしか無い。
- 予定とタスクは 1 つの `events` feature（テーブルも 1 つ、`kind` で区別）。カレンダー（月・週・日・リスト）は `calendar.get` が返す `CalendarItem[]`（と、同じ応答に載るその期間の祝日・天気）だけを読む。`CalendarItem` は `kind: 'event' | 'task'` と `placementDate` を持ち、予定とタスクの差はカードの描画と操作（完了ボタンの有無）と表示位置の規則にのみ現れる。

## ディレクトリ構成（機能単位で凝集）

```
api/
  index.ts                    # Vercel Function のエントリ。server/app.ts の Hono アプリを Sentry で包んで export する
src/                          # クライアント（Vite + React）
  main.tsx（ルーター生成・永続化キャッシュの復元・テーマ）  routeTree.gen.ts（生成物）  sw.ts（Service Worker: push / notificationclick）
  routes/                     # TanStack Router ファイルベースルート。ページは features の部品とフックを組み立てるだけ
  features/                   # 機能ごとの UI（components/, queries.ts（クエリと mutation）, optimistic.ts（楽観的更新の書き換え。events のみ）, use-*.ts（ページの状態・操作を持つフック）, __tests__/）
    api-keys/  calendar/  calendar-feeds/  events/  expenses/  lemon/  memos/  users/  push/  weather/  dashboard/（ホームの状態のタイル。各機能のクエリを読む）
    timeline/（ホームのタイムライン。全機能の記録を 1 本に並べ、行から各機能の詳細を開く）
      （calendar は events の項目を暦の上に並べる画面。項目のクエリ・書き込み・参加者の印は events が持つ）
  lib/                        # 横断。features を読まない（依存は features → lib の一方向。biome が禁じる）
    api.ts（tRPC のクライアント `api`・WriteRequest と、その組み立て `write`・sendWrite）  query-client.ts（永続化設定・書き込みキュー・useOptimisticMutation・useCreateMutation・QueryState）  form.ts（useFormSubmit・formText・formSelect・formList）  theme.ts（useAppTheme・useColorMode・previewHue（保存前のアクセントカラー））  store.ts（createStore。React の外に置く小さな値）  online.ts（useOnline）  update.ts（useUpdateApp: 最新版に入れ替えて起動し直す）  use-now.ts  date.ts  math.ts  platform.ts（iOS かの判定）  add-kinds.ts（追加できる種類の名前とアイコン）  add-pages.ts + add-search.ts（入力を開いて始める URL のしるし `add`）  shortcuts.ts（PWA のショートカット）  login-search.ts（ログイン後の戻り先の検証）  reload.ts（読み込み直し）  sentry.ts  app-badge.ts（ホーム画面のアイコンの点）  view-transition.ts + move-animation.ts（画面と記録の動き）  screen-data.ts（画面のデータの取得と配信。画面が購読する `useScreenQueries`・`useScreenHistory` と、部品が store から読む `useStoreQuery` など）  history.ts（無限スクロールの履歴の出どころと楽観的更新）  search.ts（検索窓と絞り込みの検索パラメータ。`useFilterSearch`（キーワードは中の `useKeywordSearch`））  auth.ts（ログイン状態のすべて: me・ルートのガード・ログイン・ログアウト・同意・未ログインの反映）
    ui/（AppShell（通知の表示など）+ layout.ts（枠の寸法・FAB_SX）, AddFab / AddMenu（右下の追加ボタン。種類を選ばない画面と選ぶ画面）, ナビゲーション, Dialog + dialog-history.ts（履歴を持つダイアログ）, RecordSheet（記録 1 件のシート）+ use-record-detail.tsx（閲覧と編集の切り替え・削除・記録ごとの操作。直せない・消せない記録には鉛筆・削除を出さない）, use-record-selection.ts（一覧から開いている記録と、閲覧・編集のどちらで開いたか）, use-toggle.ts（開いているかだけの状態 useToggle・値を持って開く状態 useOpenWith。開け閉めの関数は固定）, BottomSheet（下から出るシート）, notice.ts（保存の失敗などの通知）, QueryView + ListSkeleton（読み込み中の骨組みと取得失敗の表示）, CenteredPage, SettingsSection（設定画面の見出し + 行）, 共通部品）
iot/                          # LifeHub に記録を送るデバイスのファームウェア（Arduino）。記録投入用エンドポイントを API キーで呼ぶ
  lemon-record-button/        # レモンの世話を記録するボタン（M5Stack AtomS3R）
server/                       # サーバー（Hono）
  app.ts                      # ルート登録（画面の API の tRPC と外からの入口）・ETag。ここと下の 3 つが各 feature を組み立てる所
  cron.ts                     # Vercel Cron の入口（/api/cron/*。Cron secret を全体に 1 度だけ検査する）
  qstash.ts                   # QStash の配信コールバックの入口（/api/qstash/*。署名を全体に 1 度だけ検査する）
  mcp.ts                      # MCP の入口（/api/mcp。OAuth で保護）と、全 feature の mcp.ts の登録
  dev.ts                      # ローカル起動用（@hono/node-server）
  features/<name>/            # 1 機能 = 1 ディレクトリ
    schema.ts                 # Drizzle テーブル定義
    repository.ts             # DB アクセス
    service.ts                # 業務ロジック
    routes.ts                 # 画面の API の tRPC router（`.input` の Zod 検証 → service）。外と約束した口を持つ feature は Hono のルートも置く
    mcp.ts                    # MCP ツール定義
    <関心ごと>.ts             # service が大きくなる feature だけ、関心ごとに分けた業務ロジック:
                              #   events/occurrences.ts（繰り返しの回の展開）・events/targets.ts（書き込む回の指し方と実体化）・
                              #   events/patch.ts（MCP の部分更新の補い方）・events/timeline.ts（タイムラインの口）・
                              #   events/notifications.ts（通知対象の列挙と配信時再検証）、calendar-feeds/ics.ts（ics の形）、
                              #   weather/jma.ts（気象庁の JSON の取得と読み取り）・weather/telops.ts（天気コードの表）、
                              #   money/moneyforward.ts（Money Forward をブラウザで開いて読む）・money/parse.ts（読んだ文字の読み方）
  features/notifications/     # 通知の予約・配信（service）、送信済み台帳（repository）、QStash への予約（publisher.ts）
  features/mcp-events/        # MCP Events の購読（service・repository）、webhook の署名と送信（webhook.ts）、MCP のメソッド（mcp.ts）
    __tests__/
  lib/                        # 横断の土台。features を読まない（DB の表の定義 `features/*/schema.ts` だけは例外。biome が禁じる）
    db/（DB の土台。client.ts = 接続と runBatch、schema.ts = 全 feature の schema の集約、oauth-schema.ts = OAuth プラグインの表、
        coalesce-reads.ts = 同じ時点の読み取りを 1 往復にまとめる、
        query.ts = repository が使う問い合わせの部品（キーワード・作成の冪等な insert（insertOnce）・id での更新と削除・参加者の書き込み）、
        history.ts = 履歴のページ分け、timeline.ts = タイムラインの問い合わせ、auth-adapter.ts = better-auth のアダプタ、
        health.ts = ヘルスチェック、test-db.ts = テスト・seed 用の全表の消去とテスト用ユーザー）
    auth.ts（better-auth）  actor.ts（記録を書いた人か API キー）  env.ts  trpc.ts（画面の API の土台: router / procedure / userProcedure・ログインの検証・業務エラーの置き換え・手続きのスパン）  errors.ts（NotFound / Forbidden / Conflict / Validation と、失敗の種類への対応）
    mcp/（LLM 向けの形。types.ts = 登録関数・文脈・結果の形、refs.ts = エントリーの ref と繰り返しの回の指定、time.ts = JST の日付・日時の入出力、
        people.ts = 人の名前と ID、entries.ts = エントリーの出力の形）  patch.ts（部分更新と組み合わせの規則）  qstash.ts（QStash の署名検証）  after-response.ts（応答を返した後に続ける処理。Vercel の waitUntil）  sentry.ts（Sentry への報告。本番のエントリで Hono アプリを包む）
    recurrence/（RRULE 展開）  timeline-source.ts（タイムラインが各 feature から記録を集める口の型と、1 件 1 日時の記録の口を作る recordTimelineSource）  validator.ts（入力検証。`validate`）  fetch.ts（外部への GET。2xx 以外は失敗）  secret.ts（推測できない秘密の値 `newSecret`）
shared/                       # クライアント・サーバー共通
  validation/<feature>.ts     # Zod スキーマ（入力）
  id.ts（UUID v7 の採番。サーバーとクライアントが同じものを使う）
  types.ts（DateString の brand 型）  constants.ts（TIME_ZONE ほか）  date.ts（JST 固定の日付変換）  color.ts（OKLCH の色）
  calendar.ts（CalendarItem の形・暦日への割り当て・並び）  expenses.ts（立替の行と精算の式）  lemon.ts（世話の記録と状態）
  memos.ts（メモの形とピン止めの並び）  money.ts（口座と入出金の形）  timeline.ts（タイムラインの行と日時）  weather.ts（天気の形）  push.ts（プッシュ通知の中身）
  search.ts（キーワードの一致と絞り込みの有無）  sort.ts（並べ替えのキーの比べ方）  sentry.ts
drizzle/                      # マイグレーション SQL（生成物・コミットする）
infra/                        # Terraform
.github/workflows/            # ci.yml / deploy.yml / preview-cleanup.yml / backup.yml
scripts/                      # package.json の scripts から呼ぶ（README.md のコマンド一覧）
e2e/                          # Playwright（ワーカーごとのサーバーと DB は servers.ts、DB の用意は global-setup.ts。テストが共有する手順は development.md の「テスト」）
```

- ローカル開発は `vite dev`（`/api` と `/.well-known` を `server/dev.ts` へプロキシ）で行い、`vercel dev` に依存しない。
- 静的ファイルは Vite の `dist/` を Vercel が配信し、SPA のフォールバック（画面のパス → `index.html`）は `vercel.json` の rewrites で設定する。フォールバックするのは `.` を含まないパスだけ（画面のパスは `.` を含まない）で、無いファイル（デプロイで消えた旧版の `/assets/*.js` など）には `index.html` を返さず 404 にする。HTML を 200 で返すと、壊れたのは何なのか（無いのか、中身が違うのか）が応答から分からず、ブラウザも MIME の不一致としてしか報告しないため。E2E とローカル確認用の `server/dev.ts` も同じ規則でフォールバックする。`/api/*` は rewrite で `api/index.ts` の 1 関数に集約する（関数は元の URL を受け取るので Hono がパスで振り分ける）。Vercel CLI は `[[...route]].ts` のような catch-all を 1 セグメントしか一致させないため、ファイル名ではなく rewrite で行う。
- Cron は `vercel.json` の `crons` に UTC で書く（00:00 JST = `0 15 * * *`）。Cron が呼ぶ入口は `/api/cron/*`（`server/cron.ts`）の 1 か所に集め、`CRON_SECRET` の Bearer トークンの検査をその集まり全体に 1 度だけ掛ける。Cron を足すときは `crons` と `cron.ts` に 1 行ずつ足すだけで、機能ごとに認証の外の入口を増やさず、保護の付け忘れも起きない。今あるのは日次の通知の予約（`/api/cron/notifications`。[features/notifications.md](features/notifications.md)）と、月次の祝日の取り直し（`/api/cron/holidays`。[features/holidays.md](features/holidays.md)）と、1 日 3 回の天気の取り直し（`/api/cron/weather`。日ごとと 3 時間ごと。[features/weather.md](features/weather.md#取得と保存)）と、日次の前日の最高・最低気温の観測値での上書き（`/api/cron/weather/observed`。同）と、日次の Money Forward の取り込み（`/api/cron/money`。[features/money.md](features/money.md#取り込み)）。Hobby の Cron は 1 つの式が 1 日 1 回までなので、1 日に何度も呼びたい入口は、時をずらした日次の式を同じパスに並べる。
- 2 人だけが使う非公開のアプリなので、検索エンジンに載せない。クロールは `public/robots.txt`（全パスを `Disallow`）で断り、索引は `vercel.json` の全パスへの `X-Robots-Tag: noindex, nofollow` ヘッダで断る。ヘッダは HTML 以外（API の JSON やアイコン）にも効き、`<meta name="robots">` と違って `index.html` を経ない応答も覆えるため、meta タグではなくヘッダで付ける。robots.txt を守らないクローラーでもヘッダで索引から外れ、robots.txt を守るクローラーはそもそも取りに来ない。
- OAuth の探索メタデータ（`/.well-known/*`）はオリジン直下に必要なため、`vercel.json` の rewrite で `/api` の関数へ振り向ける。関数は元の URL を受け取るので、Hono は `/.well-known/*` のまま受ける（詳細は [features/mcp.md](features/mcp.md)）。
- サーバーとクライアントと E2E で tsconfig を分け（`tsconfig.server.json` / `tsconfig.client.json` / `tsconfig.shared.json` / `tsconfig.e2e.json`）、サーバーに DOM 型を、クライアントに Node 型を明示的には入れない。E2E は Playwright（Node）とページの中で動くコード（DOM）の両方を書くので、両方の型を入れる。クライアントは `server/app.ts` の `AppRouter` を型としてだけ参照する。
- import はすべて相対パスで `.ts` 拡張子付き（Node の型剥がし実行・Vite・Vercel のバンドラで同じ解決になる）。パスエイリアスは使わない。

## 横断機能との接続

- **MCP**: 各 feature の `mcp.ts` を `server/mcp.ts` に列挙する（[features/mcp.md](features/mcp.md#組み立て)）。
- **ホーム**（[features/home.md](features/home.md)）: 状態のタイル（`src/features/dashboard/components/StatusCards.tsx`）は各機能のクエリ（天気の `useHomeWeather` / レモンの `lemonStatusQueryOptions`）をそのまま読むので、サーバーの計算結果はキャッシュに 1 つしか無い。タイムラインは全機能の記録を 1 本に並べる集約の API（`timeline.get`、`server/features/timeline/`）を読む。各機能の service から記録を集めるだけで、記録の規則は各機能が持つ。どの機能の書き込みもタイムラインを invalidate する（タイムラインのキーは外に出さず、記録の書き込みのキーは `src/features/timeline/queries.ts` の `recordWriteKeys` で作る）。
- **MCP Events**（[features/mcp-events.md](features/mcp-events.md)）: 記録を書く service（memos・events・expenses・lemon）が、書いた・消した後に `server/features/mcp-events/service.ts` の `publishChanged` を直接呼ぶ。知らせる側が 4 つで形も決まっているので registry を置かない。依存は記録の feature → mcp-events の一方向で、mcp-events は記録の形（`shared/`）・LLM 向けの形（`server/lib/mcp/entries.ts`）・ユーザーの一覧（`server/features/users/people.ts`）だけを読み、記録の feature を読まない。予定・タスクの通知（`event.reminder`）は、通知の service が配信のときに `publishReminder` を呼ぶ。
- **通知**: `server/features/notifications/service.ts` が `server/features/events/notifications.ts` を直接呼ぶ（[features/notifications.md](features/notifications.md#構成)）。
- 新機能の追加手順は [.claude/skills/creating-new-feature/SKILL.md](../.claude/skills/creating-new-feature/SKILL.md)。

## 認証・認可

- Web: better-auth のセッション Cookie（同一オリジン）。画面の API（tRPC。`/api/trpc/*`）は手続きごとにログインを確かめ（`server/lib/trpc.ts` の `authed`）、クライアントは 401 を受けたら `/login` へ遷移する。**サーバー側の検証が唯一の防御線**であり、クライアント側のルートガードは UX のためだけに置く。
- `/api` の下の tRPC 以外の口は、それぞれが自分の資格を検査する。`/api` 全体に掛かる認証のミドルウェアは無いので、口を足すときは、その口に保護を付ける。
  - better-auth 自身（`/api/auth/*`。OAuth の探索メタデータ `/.well-known/*` は `/api` の外）: better-auth が扱う。
  - `/api/health`: 認証不要（下記）。
  - Vercel Cron（`/api/cron/*`）: Cron secret（`server/cron.ts`）。
  - QStash の配信コールバック（`/api/qstash/*`）: QStash の署名（`server/qstash.ts`）。
  - MCP（`/api/mcp`）: OAuth のアクセストークン（[features/mcp.md](features/mcp.md)）。
  - カレンダーの ics 配信 `/api/calendar/<token>.ics`: URL のトークンだけ（[features/calendar-feeds.md](features/calendar-feeds.md)）。
  - 記録投入 `/api/records`: API キーだけ（[features/api-keys.md](features/api-keys.md)）。
  - WHY NOT `/api` 全体にセッションを検査するミドルウェアを掛け、外の口だけを除く: 除く口の一覧という、外し忘れの起きる場所が 1 つ増える。画面の API はログインの検証を読み出しと並べて走らせる（[通信の往復](#通信の往復)）ので、先に検証を待つミドルウェアは往復も 1 回増やす。
- 権限: 全ユーザー管理者のため認可ロジックは書かない。ただし「誰が作成したか」は必ず記録する。
- `GET /api/health` は認証不要で DB 接続を確認する（`{ ok, db }`）。Sentry の稼働監視が使う（[operations.md](operations.md#監視sentry)）。
- パスワードとセッションの扱いは [features/users.md](features/users.md#認証)。
- MCP の認可は OAuth 2.1 のみ。詳細は [features/mcp.md](features/mcp.md)。

## 通信の往復

本番の応答時間は、処理の量より「待つ往復の回数」で決まる（Neon の HTTP ドライバは問い合わせ 1 回が HTTP の往復 1 回。関数は要求ごとに起動を待つことがある）。往復を減らす仕組みは、個々の画面や repository ではなく、次の 4 つの層に 1 つずつ置く。どれも呼び出し側の書き方を変えずに効く。

1. **画面の API の呼び出しを 1 本にまとめる**（tRPC の `httpBatchLink`。`src/lib/api.ts`、サーバーは `server/lib/trpc.ts` と `server/app.ts` の `/api/trpc`）: 画面は機能ごと・月ごとのクエリを並べて読むので、開くと呼び出しが何本も同時に出る（ホームはユーザー・タイムライン・天気・レモン、カレンダーは表示に掛かる月の数）。同じ時点に出た呼び出しは 1 本の要求（読み出しは GET、書き込みは POST）で送られ、サーバーはその中の手続きを並べて実行する。
   - キャッシュの単位はクエリ（機能ごと・月ごと）のまま変わらず、まとめるのは運び方だけ。書き込みの後の取り直しも、その時点に取り直すクエリだけがまとまる。WHY NOT 画面ごとに要るものを返す API: キャッシュが画面ごとの大きな塊になり、一部だけの取り直しも、画面の間でのデータの分け合いもできなくなる。
   - 運び方をまとめても、サーバーでは手続きごとに問い合わせが走るので、同じ手続きを鍵（カレンダーの月）だけ変えて並べると、往復は 1 回でも同じ形の問い合わせが鍵の数だけ走る（N+1）。カレンダーは 1 本の要求に載った呼び出しをサーバーでまとめて読む（[features/calendar.md](features/calendar.md#api)）。要求ごとに 1 つだけ作る読み手は `server/lib/trpc.ts` の `perRequest` に置く。
   - WHY tRPC: まとめて運ぶ仕組み・型の伝え方・入力の検証を自分で書かずに済む。WHY NOT GraphQL: 取り出す項目を画面が選ぶ仕組みは、画面専用で応答の形をサーバーが決めているこの API には要らず、スキーマと resolver を別に書く分だけ増える。
   - 手続きごとに Sentry のスパンを作る（`trpc/timeline.get`。1 本の要求に載った手続きのどれに時間が掛かったかを見る。[operations.md](operations.md#監視sentry)）。
2. **読み出しはログインの検証と並べて走らせる**（`server/lib/trpc.ts` の `authed`）: 読み出しの手続きは検証を待たずに走らせ、検証が通らなければ手続きの結果を捨てて UNAUTHORIZED（401）にする。ユーザーが要る手続きは `userProcedure` で検証を待ち、`ctx.userId` で ID を読む。書き込みは検証が通ってから走らせる。
3. **ログインの検証を 1 回の問い合わせにする**（`server/lib/auth.ts` の `advanced.database.joins`）: better-auth はセッションとユーザーを別々に読むが、結合を有効にしてセッションからユーザーを結合して読ませる（Drizzle のリレーションは `server/features/users/schema.ts`）。Cookie にセッションを持たせて DB を読まない方法（cookieCache）は、失効が次の要求から効かなくなるので使わない（[features/users.md](features/users.md#認証)）。
4. **同じ時点に出た DB の読み取りを 1 往復にまとめる**（`server/lib/db/coalesce-reads.ts`）: Neon のドライバを包み、同じ時点（`setImmediate` まで）に投げられた読み取りを 1 つの読み取り専用のトランザクションとして 1 回の HTTP 要求で送る。`Promise.all` で並べた問い合わせも、1 本の要求に載った各手続きの問い合わせも、ログインの検証の問い合わせも、同じ時点に出ればまとまる。書き込みはまとめず、複数文の書き込みは `server/lib/db/client.ts` の `runBatch` で明示的にまとめる（neon-http では `db.batch()` が 1 往復で 1 トランザクションとして実行し、node-postgres では明示的なトランザクションで包む。どちらでも全部通るか何も残らないかになる）。読み取りは `runBatch` に入れない（Drizzle の `batch` はまとめる仕組みを通らず自分だけで 1 往復を使うので、ほかの読み取りと同じ往復に載らなくなる。`runBatch` の型が select を拒む）。

問い合わせの結果に次の問い合わせが依るとき（タイムラインのページの区切りを決めてから行を読むなど）は、その依存の数だけ往復が残る。依存を SQL の 1 文に押し込むことはしない（別々に読める表を 1 文の中で結び付けると、読むのも直すのも難しくなる）。

## オフラインと起動速度

- アプリシェル（HTML/JS/CSS/アイコン）は Service Worker で precache し、2 回目以降はネットワークを待たずに起動する。更新は、起動時に新版を検知したらバックグラウンドで取得し、有効になった時点で読み込み直して切り替える（`autoUpdate`）。次の起動を待たずに更新したいときは設定画面の更新ボタン（下記「PWA」）。
- TanStack Query のキャッシュを IndexedDB に永続化し、起動直後は前回のデータを即表示してからバックグラウンドで再取得する（stale-while-revalidate）。Neon のコールドスタートはこの仕組みで体感上吸収する。
- API の GET には ETag と `Cache-Control: private, no-cache` を付ける（`server/app.ts`）。`staleTime: 0` で画面を開くたびに取り直すため、変わっていない一覧をそのたびに丸ごと転送しないようにする。ブラウザが `If-None-Match` を添えて聞き直し、内容が同じなら 304 で本文が流れない（常に最新を出す性質は変わらない）。
- 既定は `staleTime: 0`（`src/lib/query-client.ts`）。画面を開くたびに裏で取り直して届いたら差し替えるので、起動時だけでなくページ遷移でも手元のデータがそのまま出たままになり、一度空になることがない。永続化の書き込みは 1 秒遅れるため、変更直後に再読み込みすると古い内容が復元されることがあり、staleTime を置くとそれが残ってしまう。取り直しを抑えたいクエリ（`me`（ユーザーの一覧も載る）、VAPID 鍵、カレンダーの項目）だけが個別に staleTime を持つ。カレンダーの項目は表示（月・週・日・リスト）の切り替えで取り直さないよう `staleTime` を無期限にし、画面に入ったときに取り直す（[features/calendar.md](features/calendar.md)）。`me` は 5 分（[features/users.md](features/users.md)）。
- API はこのアプリの画面専用なので、互換性や REST としての形より通信の本数と量を優先して形を決める。画面が必ず一緒に使うものは 1 つの応答にまとめ（カレンダーの項目と祝日・天気は `calendar.get`、ログイン中のユーザーとユーザーの一覧は `me.get`）、画面が読まないものは返さない（書き込みの手続きは値を返さない。画面は送った内容で先に書き換え、後の取り直しで揃えるので、書き込みの結果を読まない。例外は API キーの発行で、キーそのものを見せられるのは発行の応答だけなので返す）。MCP は同じ service を使うが、応答の形は MCP のツール側で決める。
- キャッシュのキーは画面ではなくデータの単位で決める。範囲を持つクエリは表示範囲ではなく固定の区切り（カレンダーなら JST 暦月。[features/calendar.md](features/calendar.md)）をキーにし、表示や日付を切り替えても同じキャッシュに当たるようにする。
- **オフラインでも書き込める**。送れない書き込みは端末（IndexedDB）に溜め、オンラインに戻ったときに溜めた順で送る（下記「オフラインの書き込み」）。
- API レスポンスは Service Worker でキャッシュしない（データの正は TanStack Query の永続キャッシュに一本化する）。
- ルーターは永続化キャッシュの復元が終わってから起動する（`src/main.tsx`）。ログイン判定の `beforeLoad` は `resolveMe`（`src/lib/auth.ts`）を使い、オフラインではネットワークを待たずにキャッシュだけを返す（TanStack Query はオフライン中の取得を一時停止するため、待つと完了しない）。
- ルートに loader は置かない。データの到着を待ってから画面を切り替えると、キャッシュに無いページ（その端末で初めて開くタブ）では回線の速さのぶんだけ前の画面に留まり、操作が効いていないように見えるため。画面はマウントと同時に購読を始め、部品は `QueryView` で「手元のデータ・骨組み・失敗」を描き分ける（[ui.md](ui.md#移動と読み込み)）。
- **データの取得は画面が 1 か所で決め、部品は store から読むだけにする**（`src/lib/screen-data.ts`）。サーバーの状態は TanStack Query のキャッシュ（store）に 1 つだけ置く。
  - 画面（`src/routes/**`）が、その画面で読むクエリをすべて 1 か所で購読する（`useScreenQueries` / `useScreenHistory`）。どの画面も読むもの（ログイン中のユーザーとユーザーの一覧）はログインが要る画面をまとめるレイアウト（`routes/_authenticated.tsx`）が購読する。画面を開いている間の取り直し（入ったとき・フォーカス・再接続・書き込みの後）はこの購読が受け持つ。1 つの画面の取得は同じ描画で一斉に始まるので、まとめて 1 本の要求で届く（[通信の往復](#通信の往復)）。
  - 部品は store から読むだけで、自分では取得を始めない（`useStoreQuery` など。取得を止めた購読なので、キャッシュが変われば描き直されるが問い合わせは出ない）。画面が購読していないクエリを読むと骨組みのまま出続けるので、画面に出すものを足したら画面の購読にも足す。
  - 取得を決める画面の状態（カレンダーで出している月、リストで広げた月、選択ダイアログで送っている月）は、部品ではなく画面の状態として持つ（`src/features/calendar/use-calendar-page.ts` の `months`）。
  - 利用者の操作で読み足すもの（古いほうのページ、繰り返しの予定の繰り返し元）は操作の中で読む（`useScreenHistory` の `loadEarlier`、`src/features/events/queries.ts` の `loadEvent`）。
  - 規則は lint で強制する（`lint/screen-data.grit`）: TanStack Query の購読を使えるのは `src/lib/screen-data.ts` だけ、画面の購読を呼べるのは `src/routes/**` だけ。
  - WHY: 部品が自分でクエリを出すと、同じ画面の取得があちこちの部品に散らばり、何を読む画面なのかを画面から読み取れず、部品を描く・描かないで問い合わせが増減する。
- ログイン状態（`me`）はキャッシュにあれば信じて即起動し、期限切れはサーバーの 401 で検出する。キャッシュが「未ログイン」でもオンラインなら取り直す（ログイン直後は永続化が追いつかないことがある）。ログイン画面だけは、キャッシュにユーザーがいてもオンラインならサーバーに確かめてから「済んでいるので見せない」を決める（期限の切れたキャッシュでアプリへ送り返さないため）。ログイン状態に関わる判定と操作は `src/lib/auth.ts` に集め、画面（routes）はそれを呼ぶだけにする。
- オンラインかどうかの判定は TanStack Query の `onlineManager` に一本化する（`useOnline`）。表示（`OfflineIndicator`）と実際の振る舞い（取得の一時停止・書き込みの保留）が必ず一致する。`onlineManager` は「オンラインとみなす」から始まり online/offline イベントでしか変わらないので、起動時に `navigator.onLine` を 1 度だけ反映する（`src/lib/query-client.ts`）。オフラインのまま起動しても正しく判定できる。

## 書き込み

- 更新系は TanStack Query の mutation（`useOptimisticMutation`）で行う。送信と同時にサーバーが返すはずの値をキャッシュへ書き（楽観的更新）、失敗したら書き込み前へ戻す。
- 送信が終われば関連クエリを invalidate してサーバーの値に合わせる。再取得の完了は待たない。待つと操作の結果が回線の速さに左右され、切れれば永遠に出ない。
- フォームは送り始めた時点（オフラインなら端末に溜めた時点）で保存できたものとして扱って閉じる（画面での見え方は [ui.md](ui.md#保存と失敗)）。
- 楽観的更新に必要な計算は `shared/` の共通コードで行い、クライアントで別実装しない（上記「レイヤー構成」）。繰り返しの展開だけはサーバーにしか無いので、投機的に出すのは操作した回だけ（残りの回は再取得で揃う）。

## オフラインの書き込み

オフラインでも記録でき、オンラインに戻ったときにまとめて送る。仕組みは TanStack Query の mutation にそのまま乗せ、キューを自作しない。

- **送る内容だけを値として持つ**。書き込み 1 回分は `{ path, input }`（`WriteRequest`。path は `memos.create` のような手続きの名前）というプレーンな値で、mutation の引数になる。関数は保存できないので、送り方は `mutationKey` に紐づけた 1 つの既定（`setMutationDefaults`）に置く。復元した書き込みも同じ既定で送られるので、feature ごとの送信コードを起動時に読み込む必要がない。値は `lib/api.ts` の `write`（`write.memos.create(input)`）で作り、手続きの名前と入力の型を API の型から導いて守る。送るときは名前で手続きを呼ぶ（`sendWrite`）。
- **溜める**: `networkMode: 'online'`（既定）なのでオフラインでは送らずに保留し、保留中の書き込みは永続化キャッシュに含まれる（`persistOptions` の dehydrateOptions が、保留中の mutation のうち書き込みのキーを持つものだけを残す。既定を持たないほかの mutation は、残すと送り方の無いまま復元されるため）。アプリを閉じても消えず、次の起動で復元して送る（`main.tsx` の `resumeWrites`）。
- **順序**: すべての書き込みが同じ `scope` を持つので 1 つずつ順に走り、「追加してから直す」が操作した順でサーバーに届く。
- **表示**: 楽観的更新の結果も同じ永続化キャッシュに入るので、オフラインで記録したものは再読み込みしても画面に出たままになる。未送信の件数はオフラインの印のツールチップに出す（未送信があるときだけ。見え方は [ui.md](ui.md#appbar-と検索)）。
- **送り直し**: 通信断（`isNetworkError`）だけ送り直す。サーバーが理由を返した失敗（検証エラーなど）は送り直しても変わらないので、その場で諦めて楽観的更新を戻し、通知で伝える。
- **同じ行に何度書いても同じ結果にする**: 追加する行の ID はクライアントが決めて送り（`shared/id.ts` の `newId`、`shared/validation/*.ts` の作成リクエスト）、サーバーは同じ ID の作成が既にあれば何も書かない（送られた値で上書きしない。作った後に編集してから古い作成が再送されると、上書きでは編集が巻き戻るため）。オフラインで作った項目をその場で編集・削除でき（仮の ID を後から差し替えずに済む）、送り直しても二重に作られない。
- **未ログインになったら捨てる**: ログアウトしたとき、API が 401 を返したときは、溜めた書き込みを捨てる（`src/lib/auth.ts` の `markSignedOut`）。書き込みは送る時点のセッションで送られるので、残すと次にログインした別のユーザーとして送られてしまう。401 のときに残して同じユーザーの再ログインを待つことはしない: 401 はオンラインでしか起きず、オンラインでは溜めた書き込みはすぐ送られて同じ 401 で失敗するので、残しても通る見込みが無い。
- **書いた人のものとしてだけ送る**: 書き込みは送る時点のセッションで送られるので、書き込みごとに書いたときのユーザーを持ち、送る試行のたびに今のユーザーと比べる（`sendAsAuthor`）。違えば送らずに諦める。ログアウトは溜めた書き込みを捨てるが、送り直しを待っている書き込みは TanStack Query では止められず、その間に別のユーザーでログインすると、その人の記録として保存されてしまうため。
- **溜めないもの**（`queue: false`）: 溜めても意味が無い書き込み。ユーザーの登録・変更はパスワードを含むので端末に残さず、オフラインではその場で失敗させる。カレンダーの配信 URL の発行・変更・失効（[features/calendar-feeds.md](features/calendar-feeds.md)）は、発行されるまで渡す URL が無く、変更と失効は効いたことをその場で確かめたい（誰の予定が配られるかが変わる）。API キーの失効も同じ理由で溜めない（発行は応答のキーを画面に出すので、この仕組みを使わずに応答を待つ）。プッシュ通知の購読はブラウザとサーバーの両方に繋がる操作なので溜めない。溜めない書き込みは溜める書き込みと別の mutationKey（`direct-write`）で送り、溜めた書き込みの順番待ち（scope）にも端末に残す対象にも入れない。同じキーだと、溜めた書き込みがある間はその後ろで待ち、待つ間は保留中として端末に残る（パスワードが IndexedDB に書かれる）うえ、オンラインに戻るまで結果が出ない。


## PWA

- Web App Manifest（`name: LifeHub`, `display: standalone`, アイコン 192/512/maskable）。`theme_color` / `background_color` は指定しない。manifest の色は 1 色しか持てず、ライト／ダークを切り替えられないため。
- ショートカット（manifest の `shortcuts`。ホーム画面のアイコンの長押し、タスクバーの右クリックから開く）: 一覧は `src/lib/shortcuts.ts` に 1 つだけ置き、manifest（`vite.config.ts`）とアイコンの生成が同じ物を読む。入力を開くものは URL のしるし（`add`）で始め、受けた画面が開くと同時にしるしを消す（スキーマも消す処理も `src/lib/add-search.ts`。開いている入力は画面の状態で、URL に残す物ではない）。しるしを受ける画面と開ける種類は `src/lib/add-pages.ts` の表 1 つで、画面の検索スキーマもショートカットの URL（`addUrl`）もそこから作るので、画面が受け取れない種類をショートカットに書くと型で止まる。しるしはホーム・予定・立替・レモンの各画面が読むので、どの機能にも属さない `src/lib` に置く。追加できる種類の名前とアイコン（`src/lib/add-kinds.ts`）も同じ理由で `src/lib` に置く。しるしが開くのは追加ボタンが開くのと同じ入力（同じ状態）で、ショートカット専用の道は作らない。
- ステータスバー（スマホ）とタイトルバー（PC）の色は、メディアクエリ付きの `theme-color` メタで配色ごとに渡す。値はアプリの面の色そのもの（`shared/color.ts` の `SURFACE`）で、AppBar と地続きに見える。テーマと二重管理にならないよう、index.html には直接書かず `vite.config.ts` の `themeColorMeta` が注入する。
- iOS 向け: `apple-mobile-web-app-*` メタ、`apple-touch-icon`。ステータスバーは `default`（iOS がページの背景色に合わせて塗り、文字色も選ぶ）。
- Service Worker（`vite-plugin-pwa`, `injectManifest` 方式で `src/sw.ts` を自前管理）: precache、`push` / `notificationclick` の処理。`registerType: 'autoUpdate'`（`skipWaiting` + `clientsClaim`）。
- 手動更新: 設定画面の「バージョン」の右の更新ボタン（`src/lib/update.ts`）。インストールした PWA は precache から起動するため再読み込みでは版が変わらないので、`registration.update()` で Service Worker を取りに行き直す。新版が見つかれば、それが有効になった時点で上記 `autoUpdate` の経路が読み込み直す。新版が無いときと、取りに行けなかったとき（オフライン等）だけ自分で読み込み直す（押しても何も起きない状態を作らない）。
- デプロイで消えた旧版のコード: 旧版のページがまだ読み込んでいない画面のコードは、デプロイ後はサーバーにも、新版の Service Worker が入れ替えた precache にも無い。取りに行って失敗したら（`vite:preloadError`）読み込み直し、新版で開き直す（`src/lib/reload.ts` の `reloadOnStaleChunk`）。
  - 読み込み直しても同じ失敗がすぐ続く（オフラインで precache にも無い、壊れたデプロイなど）ときは繰り返さず、エラー画面を出す。回数（セッションで 1 度）ではなく間隔（`STALE_CHUNK_RELOAD_INTERVAL_MS`）で止めるのは、同じタブを開いたまま次のデプロイを迎えたときに、また読み込み直せるようにするため。
  - アプリの読み込み直しはすべて `src/lib/reload.ts` の `reloadApp` を通し、始めたことを持つ（`lint/reload.grit` が強制する）。読み込み直しを始めた後のエラーはページごと捨てられて利用者に届かないので、エラー画面を出さずに骨組みのままにし（`ErrorPage`）、Sentry にも送らない（[operations.md](operations.md#監視sentry)）。
  - WHY NOT TanStack Router の読み込み直し（`lazyRouteComponent`）に任せる: 同じ失敗で読み込み直すが、ページが離れるまでの描き直しでエラーを投げるので、エラー画面が一瞬出て報告も送られる。こちらが先に読み込み直し、その間のエラーを上のとおり扱う。
- アイコンは `public/icons/favicon.svg`（アプリのアイコン）、`public/icons/badge.svg`（通知の小さな印）、アプリが使っている MUI のアイコン（ショートカット）を元に `pnpm icons:generate`（Playwright の Chromium でラスタライズ）で生成し、生成物をコミットする。画像ライブラリを増やさないため。ショートカットの絵は、アプリが使っている MUI のアイコン（下部ナビと追加ボタンのもの）を React からそのまま描き出し、アプリのアイコンと同じ角丸の板に白で置く。絵の選択も path も書き写さないので、アプリの表示とショートカットが必ず同じ絵になる。
