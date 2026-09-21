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
| DB ドライバ / ORM | `@neondatabase/serverless`（HTTP）+ Drizzle ORM + drizzle-kit | サーバーレスに適した接続方式。スキーマが TypeScript で単一情報源。HTTP ドライバは対話的トランザクションを持たないため、複数文の原子性が必要な箇所は `server/lib/db.ts` の `runBatch()` で書く（neon-http では `db.batch()`、node-postgres では順次実行になる）。ローカル／テストは `drizzle-orm/node-postgres`（`server/lib/db.ts` で `VERCEL` 環境変数により切替）。 |
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
- クライアントは Service 層の結果を表示し、入力を送るだけ。計算（残高・繰り返し展開・タスクの表示位置）をクライアントで再実装しない。
- 予定とタスクは 1 つの `events` feature（テーブルも 1 つ、`kind` で区別）。カレンダー（月・週・日・リスト）は `GET /api/events` が返す `CalendarItem[]` だけを読む。`CalendarItem` は `kind: 'event' | 'task'` と `placementDate` を持ち、予定とタスクの差はカードの描画と操作（完了ボタンの有無）と表示位置の規則にのみ現れる。

## ディレクトリ構成（機能単位で凝集）

```
api/
  index.ts                    # Vercel Function のエントリ。server/app.ts の Hono アプリをそのまま export するだけ
src/                          # クライアント（Vite + React）
  main.tsx（ルーター生成・永続化キャッシュの復元・テーマ）  routeTree.gen.ts（生成物）  sw.ts（Service Worker: push / notificationclick）
  routes/                     # TanStack Router ファイルベースルート。ページは features の部品とフックを組み立てるだけ
  features/                   # 機能ごとの UI（components/, queries.ts, use-*.ts（ページの状態・操作を持つフック）, __tests__/）
    calendar/  events/  expenses/  lemon/  users/  push/  dashboard/（ホームのカード。各機能のクエリを読む）
  lib/                        # 横断
    api.ts（Hono RPC client）  query-client.ts（永続化設定・useInvalidate・ensureData）  form.ts（useFormSubmit・formText・formSelect・formList）  theme.ts（createAppTheme・useColorMode）  online.ts（useOnline）  use-now.ts  date.ts  auth.ts
    ui/（AppShell（FAB_SX など）, ナビゲーション, FormDialog, CenteredPage, 共通部品）
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
    middleware.ts（requireSession）  errors.ts（NotFound / Conflict / Validation）  id.ts（UUID v7）  test-db.ts（テスト・seed 用の truncate）
    mcp/（server.ts = 全 feature の mcp.ts を登録）  push/（購読管理・送信）  qstash.ts
    recurrence/（RRULE 展開）  notifications/（enqueue, deliver）  validator.ts（入力検証の 400 応答）
shared/                       # クライアント・サーバー共通
  validation/<feature>.ts     # Zod スキーマ（入力）
  types.ts（DateString の brand 型）  constants.ts（TIME_ZONE ほか）  date.ts（JST 固定の日付変換）  color.ts（OKLCH の色）
drizzle/                      # マイグレーション SQL（生成物・コミットする）
infra/                        # Terraform
.github/workflows/            # ci.yml / deploy.yml / preview-cleanup.yml
scripts/                      # create-user.ts / seed-dev.ts / generate-vapid-keys.ts / generate-icons.ts
e2e/                          # Playwright
```

- ローカル開発は `vite dev`（`/api` を `server/dev.ts` へプロキシ）で行い、`vercel dev` に依存しない。
- 静的ファイルは Vite の `dist/` を Vercel が配信し、SPA のフォールバック（全パス → `index.html`）は `vercel.json` の rewrites で設定する。`/api/*` は rewrite で `api/index.ts` の 1 関数に集約する（関数は元の URL を受け取るので Hono がパスで振り分ける）。Vercel CLI は `[[...route]].ts` のような catch-all を 1 セグメントしか一致させないため、ファイル名ではなく rewrite で行う。
- Cron は `vercel.json` の `crons` に UTC で書く（00:00 JST = `0 15 * * *`）。
- OAuth の探索メタデータ（`/.well-known/*`）はオリジン直下に必要なため、`vercel.json` の rewrite で `/api/well-known/*` へ転送する（詳細は [features/mcp.md](features/mcp.md)）。
- サーバーとクライアントで tsconfig を分け（`tsconfig.server.json` / `tsconfig.client.json` / `tsconfig.shared.json`）、サーバーに DOM 型を、クライアントに Node 型を明示的には入れない。クライアントは `server/app.ts` の `AppType` を型としてだけ参照する。
- import はすべて相対パスで `.ts` 拡張子付き（Node の型剥がし実行・Vite・Vercel のバンドラで同じ解決になる）。パスエイリアスは使わない。

## 横断機能との接続

- **MCP**: `server/features/*/mcp.ts` が `ToolRegistrar` を export し、`server/lib/mcp/server.ts` に列挙する（実装が複数あり、SDK が登録関数を要求するので registry の形にしている）。
- **ホーム**: 集約 API は持たない。`src/features/dashboard/cards/*` の各カードが自分の機能のクエリ（`calendarItemsQueryOptions` / `balanceQueryOptions` / `lemonStatusQueryOptions`）をそのまま読むので、サーバーの計算結果はキャッシュに 1 つしか無く、書き込み後の無効化はその機能のキーだけで済む。カードごとに読み込みとエラーを出せる。
- **通知**: 通知源は events だけなので registry を置かず、`server/lib/notifications/service.ts` が `server/features/events/notifications.ts` を直接呼ぶ（[features/notifications.md](features/notifications.md)）。
- 新機能の追加手順は [.claude/skills/creating-new-feature/SKILL.md](../.claude/skills/creating-new-feature/SKILL.md)。

## 認証・認可

- Web: better-auth のセッション Cookie（同一オリジン）。Hono の認証ミドルウェアで `/api/*`（`/api/auth/*`・`/api/health`・`/api/well-known/*`・通知コールバック・MCP を除く）を保護し、クライアントは 401 を受けたら `/login` へ遷移する。**サーバー側の検証が唯一の防御線**であり、クライアント側のルートガードは UX のためだけに置く。
- 権限: 全ユーザー管理者のため認可ロジックは書かない。ただし「誰が作成したか」は必ず記録する。
- `GET /api/health` は認証不要で DB 接続を確認する（`{ ok, db }`）。E2E の起動確認にも使う。
- パスワード: better-auth 標準のハッシュ。最低 12 文字。`scripts/create-user.ts` は better-auth のハッシュ関数を使い、`DATABASE_URL` に直接接続して投入する。
- MCP の認可は OAuth 2.1 のみ。詳細は [features/mcp.md](features/mcp.md)。

## オフラインと起動速度

- アプリシェル（HTML/JS/CSS/アイコン）は Service Worker で precache し、2 回目以降はネットワークを待たずに起動する。更新は「新版を検知したらバックグラウンドで取得し、次回起動で切替」（Workbox の `autoUpdate`）。
- TanStack Query のキャッシュを IndexedDB に永続化し、起動直後は前回のデータを即表示してからバックグラウンドで再取得する（stale-while-revalidate）。Neon のコールドスタートはこの仕組みで体感上吸収する。
- オフライン時は閲覧のみ。書き込み操作はオフライン中は無効化し、その旨を表示する。オフライン書き込み（キューして再送）は将来の拡張とし、初期スコープに含めない。
- API レスポンスは Service Worker でキャッシュしない（データの正は TanStack Query の永続キャッシュに一本化する）。
- ルーターは永続化キャッシュの復元が終わってから起動する（`src/main.tsx`）。loader / beforeLoad は `ensureData`（`src/lib/query-client.ts`）を使い、オフラインではネットワークを待たずにキャッシュだけを返す（TanStack Query はオフライン中の取得を一時停止するため、`ensureQueryData` が完了しなくなる）。
- ログイン状態（`me`）はキャッシュにあれば信じて即起動し、期限切れはサーバーの 401 で検出する。キャッシュが「未ログイン」でもオンラインなら取り直す（ログイン直後は永続化が追いつかないことがある）。
- オフライン時は `useOnline`（`navigator.onLine` + online/offline イベント）で判定し、`SubmitButton` と完了チェックを無効化し、`OfflineBanner` で案内する。

## UI / UX 方針

- **最上位ルールはシンプリシティ**。Material Design 3 をベースにした、装飾の少ない UI。Google カレンダー／Google ToDo リストを手本にする。
- Material Design 3 の top app bar は primary 色の帯ではなく surface 色（境界線のみ）なので、AppBar・下部ナビも surface 色にする（`src/lib/theme.ts`）。primary は選択状態・FAB・終日バーなど「今の主役」だけに使う。下部ナビの選択項目は tonal な丸みのあるインジケータ、FAB は角丸 16px、ダイアログは角丸 28px、ボタンは pill 形。影（elevation）は既定で 0。
- アクセントカラーはログイン中のユーザーの色（OKLCH の色相だけをユーザーが選び、彩度・明度はアプリが決める。`shared/color.ts`、[users.md](features/users.md)）。ログイン前は既定の色相（ブランドカラー `#A0148C` の色相）。secondary は使わず、強調はすべて primary で統一する。カレンダーの項目は参加者が 1 人ならそのユーザーの色、共有（参加者が 1 人でない）なら彩度 0 の無彩色（`src/features/calendar/queries.ts` の `colorUserOf`、`src/features/users/use-user-color.ts`）。
- ダークモード対応（`prefers-color-scheme` 追従、MUI の CSS 変数テーマで切替時のちらつきを避ける）。
- レスポンシブ: モバイルファースト。スマホでは下部ナビゲーション（BottomNavigation。ホーム／予定／立替／レモンの 4 つ。設定はホームの末尾から開く）、PC ではサイドナビ（permanent Drawer。設定も含む。アプリ名は出さない）に切り替える。ページ自体は共通。
- **画面の表示領域は貴重な資産**として扱う。「ホーム」「カレンダー」のような情報を持たないページタイトルは出さない（現在地はナビが示す）。同じ情報を複数箇所に出さない。主役（カレンダーのグリッド、一覧、カード）が最も広い面積を占めるようにする。
- AppBar はアプリ名の帯ではなく、そのページの操作のための帯（`AppBarContent` で Portal 経由に差し込む: カレンダーの年月と表示の切替、リスト表示の検索と絞り込み、ユーザー登録など）。それ以外（アカウントメニューなど）は置かない。ログアウトとユーザー管理は設定画面。スマホでは dense（48px）。
- スマホでは main の余白を 0 にし、一覧やグリッドを画面端まで広げる（edge-to-edge）。PC のみ最小限の余白を置く。
- カレンダーの月・週・日表示は画面の残り全部を占める（AppShell が下に確保する余白は負のマージンで打ち消す）。日をタップすると日表示へ、スマホでは左右のスワイプで前後へ、年月をタップすると選択ダイアログ。前後ボタンは置かない。
- 月グリッドは Google カレンダー流: 複数日・終日の予定は週ごとに 1 本の連続したバー（レーン割り当て）、時刻付き予定は「● タイトル」（時刻は PC のみ）、タスクはチェック印付き。常にタイトルを優先し、収まらない分は「+n」でまとめる。週・日は Google カレンダーと同じタイムライン（時間軸に塗りブロック、終日欄、現在時刻の線）。
- 一覧はカードを重ねずフラットな行（左に時刻列、右にタイトルと補足）で並べる。カレンダーのリスト表示は `DayList` / `ItemCard`、ホームの「今日」は同じ体裁のより簡素な行（印・時刻・タイトルだけ）。
- 入力フォームのダイアログはスマホでは全画面（`FormDialog`）。閉じるボタンを見出しに、保存ボタンを下端に固定する。
- 入力は極力少ないタップで完了させる（ホームのクイック追加、既定値の自動入力、日付は今日を初期値）。
- 更新系は TanStack Query の mutation で行い、成功後に関連クエリを invalidate する。楽観的更新は必要になるまで入れない。
- フォント: システムフォント（`system-ui`）。Web フォントは読み込まない。

## PWA

- Web App Manifest（`name: LifeHub`, `display: standalone`, `theme_color` = `#A0148C`, アイコン 192/512/maskable）。
- iOS 向け: `apple-mobile-web-app-*` メタ、`apple-touch-icon`。
- Service Worker（`vite-plugin-pwa`, `injectManifest` 方式で `src/sw.ts` を自前管理）: precache、`push` / `notificationclick` の処理。`registerType: 'autoUpdate'`（`skipWaiting` + `clientsClaim`）。
- アイコンは `public/icons/favicon.svg` を元に `pnpm icons:generate`（Playwright の Chromium でラスタライズ）で生成し、生成物をコミットする。画像ライブラリを増やさないため。

## 運用

原則: インフラの設定はすべて `infra/` の Terraform に書き、ダッシュボードで直接変更しない。デプロイは main ブランチへのプッシュで完結する。手動作業は初回セットアップ（[README](../README.md#初回セットアップ人が一度だけ行う手作業)）だけに限定する。

### Terraform（`infra/`）

| 対象 | リソース | 備考 |
|---|---|---|
| Vercel プロジェクト | `vercel_project` | フレームワーク `vite`、`git_repository` は設定しない（自動デプロイを無効化し、デプロイは GitHub Actions が行う） |
| ドメイン | `vercel_project_domain`（`lifehub.crat.jp`） | 外部 DNS への CNAME 登録は手動。登録先の値は `terraform output dns_cname_target` |
| 環境変数 | `vercel_project_environment_variable` | `DATABASE_URL`（Neon の出力）、`BETTER_AUTH_SECRET`・`CRON_SECRET`（`random_password`）、`QSTASH_*`・`VAPID_*`（変数から）。production / preview 共通でいずれも `sensitive`。`APP_URL` は production のみで `sensitive` ではない |
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
2. `terraform plan`（結果を PR コメントに投稿。差分が意図通りか、replace が無いかを人と LLM が確認する）。以下 3〜6 は main への最初の `terraform apply` が済んでいるとき（state に Vercel プロジェクトがあるとき）だけ実行する
3. Neon ブランチ `preview/pr-<番号>` を `main` から作成（既にあれば再利用。`neondatabase/create-branch-action`）
4. そのブランチに `drizzle-kit migrate` を適用（本番相当のデータに対してマイグレーションを検証する）
5. `vercel pull --environment=preview` → `vercel build` → `vercel deploy --prebuilt` に `--env DATABASE_URL=<PR ブランチの接続文字列>` を付けて Preview デプロイ
6. Preview URL と Neon ブランチ名を PR コメントに投稿（更新時は同じコメントを書き換える）

**PR クローズ／マージ（`preview-cleanup.yml`）**: Neon ブランチ `preview/pr-<番号>` を削除。Free プランのブランチ数上限（10）を超えないよう必ず行う。

**main へのプッシュ（`deploy.yml`）**: `terraform apply -auto-approve` → `drizzle-kit migrate`（`DATABASE_URL` は `terraform output`）→ `vercel pull --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod`。

Preview 環境の挙動:
- Preview の環境変数は Terraform（target = `preview`）で管理し、`DATABASE_URL` だけをデプロイ時に PR ブランチの値で上書きする。
- `VERCEL_ENV !== 'production'` のとき、日次 Cron の通知予約と QStash への publish を無効化する（Preview から本番と同じ通知が二重に飛ぶのを防ぐ）。配信コールバックの署名検証は Preview でも行う。
- better-auth の `baseURL` は、`APP_URL` があればそれに固定し、無ければ（= Preview）`*.vercel.app` に限ってリクエストのホストから決める。Preview は URL がデプロイごとに変わるため、固定値では origin チェックに落ちてログインできない。

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
- 依存関係の自動更新ツールは導入していない。更新は手動の PR で行う。
