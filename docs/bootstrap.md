# LifeHub — プロジェクト基盤ドキュメント

本書はバイブコーディング（AIコーディングエージェント主体の開発）の土台となる文書である。
AIエージェントは実装前に必ず本書を読み、記載された理念・規約・構成に従う。
本書と矛盾する判断が必要になった場合は、実装せずに本書の改訂を先に提案する。

## 0. 本書の位置づけ

- 本書は**初期開発のブートストラップ工程への入力**である。AIエージェントは本書をもとに、リポジトリ内に恒久的なドキュメント群を生成し、以後はそれらを単一情報源として保守する。ブートストラップ完了後にこのドキュメントを削除すること。

- 本書から生成するもの（M0 で作成）:
  - `README.md` — 概要、セットアップ手順（§13.4）、コマンド一覧（§18）
  - `AGENTS.md`（`CLAUDE.md` はシンボリックリンク） — 開発理念（§2）、規約（§6・§14）、`docs/` への参照
  - `.claude/skills/creating-new-feature/SKILL.md` — 機能追加手順（§15）
  - `docs/architecture.md` — §5〜§6・§10〜§13 の内容
  - `docs/data-model.md` — §7
  - `docs/features/<name>.md` — §4・§8・§9 を機能ごとに分割したもの（events, tasks, calendar, expenses, lemon, notifications, mcp, users）
- 生成後、本書の内容と生成物が食い違う場合は生成物が正となる。
- 実装は §17 のマイルストーン順に進める。各マイルストーンは1つ以上の PR に分割してよいが、順序は守る。
- 生成物に書かれていない判断が必要になったら、該当する `docs/` に追記して進め、PR の説明に明記する。人に確認が必要な場合のみ止まる。

---

## 1. 目的と前提

- 家庭内で使うあらゆるツールを1つのWebアプリ「LifeHub」に集約する。
- 公開URL: `https://lifehub.crat.jp`（`crat.jp` の権威DNSは外部にあり、サブドメインの CNAME のみで割り当てる）
- 初期機能は4つ（§4）だが、今後も機能を継続的に追加していく。**機能追加が容易な構造**が最重要。
- 長期（年単位）にわたってメンテナンスする。**保守性 > コードの短さ**。
- 利用者は2人・データ量は小規模。スケーラビリティよりも単純さと正しさを優先する。
- **少人数がヘビーに使う**特性から、初回ロードより**2回目以降の起動速度とオフライン閲覧**を重視する。
- インフラは**すべて無料枠**で運用する（Vercel Hobby / Neon Free / Upstash QStash Free）。

## 2. 開発理念（すべての判断の上位原則）

> **シンプル至上主義。書かなくて済むものは書かない。Web標準機能を使えるなら使う。ライブラリを使えるなら使う。**

判断の優先順位:
1. **Web標準**（HTML/CSS/JS/ブラウザAPI）で実現できるならそれを使う。例: `<input type="datetime-local">`, `<dialog>`, `FormData`, `Intl`, Web Push / Notifications API, Service Worker, IndexedDB, CSS Grid / Container Queries, View Transitions。
2. **フレームワーク・プラットフォーム標準**（React / Hono / Vercel）で実現できるならそれを使う。例: Hono RPC, Vercel Cron, Vercel の静的配信。
3. **実績あるライブラリ・標準仕様**で実現できるならそれを使う。例: 繰り返しルールは RFC 5545 RRULE。自作は最終手段。
4. それでも足りないときだけ自分で書く。

付随する原則:
- **ブラウザ互換性は考慮しない。** 最新版の Chrome と Safari（iOS含む） のみを対象とし、ポリフィルや古い記法を入れない。
- **ベストプラクティスを厳格に適用する。** 「動くから良い」ではなく、公式ドキュメントや業界のプラクティスが推奨する形で書く。
- **明示性 > 暗黙の魔法。** 型・命名・ファイル配置で意図が読み取れるようにする。
- **一貫性。** 既存機能と同じ構造・同じパターンで新機能を作る（§15）。
- **業務ロジックはサーバー（Hono）に置く。** クライアントは表示と入力に徹し、UIとMCPが同じサービス層を共有する。

## 3. 利用者とアクセス経路

| 経路 | 内容 |
|---|---|
| スマホ（PWA） | ホーム画面に追加してアプリのように使う。iPhone / Android。プッシュ通知を受け取る。オフラインでも閲覧できる。 |
| PC（ブラウザ） | 同じURL・同じページ。**レスポンシブで1つのUIを共有**し、画面を分けない。 |
| MCPサーバー | 任意のAIツール（Claude 等）からデータの参照・登録を行う。認可は OAuth 2.1。 |

- 全ユーザーが管理者権限を持つ（権限の区別は設けない）。
- アカウントは管理画面（`/admin/users`）から作成する。最初のユーザーはリポジトリ内のスクリプト（`scripts/create-user.ts`）で作成する。
- 言語は日本語のみ。タイムゾーンは `Asia/Tokyo` 固定。

## 4. 機能要件

### 4.1 初期機能

| 機能 | 概要 |
|---|---|
| 予定（イベント） | 2人の予定を管理する。誰の予定か（自分／相手／共有）を区別する。**繰り返し設定可**。開始前にプッシュ通知。過去の予定も記録として保持する。 |
| タスク | やること全般（買い物を含む）。**開始日時と期限日時を別々に設定**できる（どちらも任意）。**繰り返し設定可**。開始日時・期限日時にプッシュ通知。**専用画面は持たず、カレンダー／イベント画面の中で予定と並べて確認・管理する**（表示規則は §4.3）。 |
| 立替・精算 | どちらが立て替えたかと金額を記録し、**常に折半**で貸借残高を計算する。精算で残高をゼロに戻す。 |
| レモンの木の世話記録 | 記録項目は **水やり・葉水・施肥・開花・収穫・メモ（自由記入）**。項目ごとに最終実施日からの経過日数を表示する。対象はレモンの木1本に固定し、複数植物への拡張は必要になった時点で行う。 |

### 4.2 主要画面

| 画面 | パス | 内容 |
|---|---|---|
| ホーム | `/` | ダッシュボード。カードは §4.4。各種記録を**この画面から直接追加**できる（クイック追加: 予定・タスク・立替・レモンの記録の4種。各フォームをボトムシート／ダイアログで開く）。 |
| カレンダー | `/calendar` | 予定と**タスク**を月／週のグリッドで閲覧・追加・編集・削除。 |
| イベント | `/events` | カレンダーと**同じデータ（予定＋タスク）**を、時系列リストとして高機能に扱う画面。期間指定・種別（予定／タスク）・所有者フィルタ・完了状態・キーワード検索・過去の記録の振り返り。 |
| 立替 | `/expenses` | 立替履歴、残高、精算。 |
| レモン | `/lemon` | レモンの木の世話記録と状態（項目ごとの最終実施日と経過日数）。 |
| 管理 | `/admin/users` | ユーザー登録・管理。 |
| 設定 | `/settings` | プッシュ通知の有効化（この端末で受け取る）。 |
| ログイン | `/login` | メールアドレス＋パスワード。 |

### 4.3 カレンダー／イベント画面でのタスクの表示規則

タスクは「どの日付に置くか」を次の規則で決める（`placement_date`）。予定と同じグリッド・同じリストに、種別が見分けられる見た目で並べる。

| 状態 | 表示位置 |
|---|---|
| 未完了・開始日時が未来 | 開始日時の位置 |
| 未完了・開始日時が過去（または今日）、または開始日時が未設定 | **今日**の位置（完了するまで毎日繰り越される） |
| 完了 | 完了した日時の位置 |

- 開始日時が未設定の未完了タスクは、期限日時の有無にかかわらず今日の位置に置く。
- 期限日時は表示位置には使わず、カードに「期限」として併記する。期限超過はカードを強調表示する。
- 繰り返しタスクは発生（occurrence）ごとに同じ規則を適用する。ただし**同じタスクは同時に最大2つまでしか表示しない**:
  - 表示するのは、キャンセルされていない未完了の発生のうち基準日時が最も早い2つ。過去の発生は今日の位置、未来の発生はその日時の位置に置く。3つ目以降の未来の発生は表示しない。
  - 未完了の発生 N は、発生 N+2 の基準日時が到来した時点で**放棄**され、表示されなくなる（放棄は計算で導き、保存しない）。つまり未完了の繰り越しは「2つ後の発生が来るまで」。
  - 例: 毎週月曜のタスクで 9/7 を未完了のまま 9/14 を迎えると 9/7 と 9/14 が今日の位置に並び、9/21 を迎えると 9/7 は消えて 9/14 と 9/21 が並ぶ。
- カレンダーからタスクを直接「完了」にできる。完了操作は `task_completions` に `completed_at` を記録し、そのタスクは完了日時の位置へ移る。
- カレンダー画面の初期表示は今月（月表示）、イベント画面の初期表示は「今日から前後7日」。

### 4.4 ホームのカード（初期セット）

| カード | 内容 | 提供元 |
|---|---|---|
| 次の予定 | 現在時刻以降で最も近い予定を最大5件（自分・相手・共有すべて） | `events/dashboard.ts` |
| 今日のタスク | §4.3 の規則で今日の位置にある未完了タスク（期限が近い順）。カード上で完了操作可。なければ「なし」 | `tasks/dashboard.ts` |
| 立替残高 | 「A→B に n 円」の1行表示。0 なら「精算済み」 | `expenses/dashboard.ts` |
| レモン | 水やり・葉水それぞれの最終実施日からの経過日数 | `lemon/dashboard.ts` |

カードの並び順は `DashboardWidget.order`。カードをタップすると該当機能の画面へ遷移する。

右下にFABがあり、マウスホバーまたはタップで展開して「予定」「タスク」「立替」「レモン」に関する記録を追加するボタンが表示される。

## 5. 技術スタック（決定事項と理由）

| 領域 | 採用 | 理由 |
|---|---|---|
| ホスティング | **Vercel（Hobby）** | 外部DNSからの CNAME だけで独自ドメインを割り当てられる。静的配信と Serverless Function を1プロジェクトで扱える。無料・カード不要。非商用限定だが家庭利用のため問題ない。 |
| フロントエンド | **React（最新安定版）+ TypeScript（strict）**、**Vite** ビルドの SPA | オフライン対応と積極的キャッシュを単純に実現するため、SSR ではなく静的なアプリシェルにする。MUI が使え、AIコーディングエージェントの出力品質も最も安定している。 |
| ルーティング | **TanStack Router**（ファイルベース） | 型安全なルート・検索パラメータ。TanStack Query と統合できる。 |
| データ取得・キャッシュ | **TanStack Query** + `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister`（ストレージは `idb-keyval` で IndexedDB） | サーバー状態の標準的な管理。永続化によりオフライン閲覧と即時起動を実現する。 |
| バックエンド | **Hono**（Vercel Function 1つ、Node ランタイム） | `hono/vercel` アダプタで `api/` に配置。**Hono RPC** でクライアントに API の型が伝わり、tRPC 等の追加なしで型安全になる。1関数にまとめることで Hobby の関数数上限を気にしなくてよい。 |
| DB | **Neon（Postgres, Free）** — Terraform で直接管理（Vercel Marketplace 連携は使わない） | 無料の Postgres。アイドル時のコンピュート停止によるコールドスタートは、起動時にキャッシュから描画する設計で吸収する。 |
| DB ドライバ / ORM | **`@neondatabase/serverless`（HTTP）+ Drizzle ORM（`drizzle-orm/neon-http`）+ drizzle-kit** | サーバーレスに適した接続方式。型安全・スキーマがTypeScriptで単一情報源。HTTP ドライバは対話的トランザクションを持たないため、複数文の原子性が必要な箇所は Drizzle の `db.batch()` で書く。ローカル／テストは `drizzle-orm/node-postgres` に差し替える（`server/lib/db.ts` で切替）。 |
| ランタイム | **Node.js 最新 LTS**（`.node-version` と `package.json#engines` で固定） | Vercel Function と CI で同じバージョンを使う。 |
| バリデーション | **Zod**（`shared/` に配置）+ `@hono/zod-validator` | クライアントのフォーム・APIの入力・MCPツールの引数を**同じスキーマ**で検証する。 |
| 認証 | **better-auth**（メール＋パスワード、Drizzle アダプタ） | Hono 対応。MCP向け OAuth 2.1 プラグインを持つ（§8）。 |
| MCPサーバー | **`@hono/mcp` + `@modelcontextprotocol/sdk`**、Streamable HTTP（ステートレス） | 同じ Hono アプリに MCP エンドポイントを載せる。サーバーレスのためセッションを持たないステートレスモードで動かす。 |
| 繰り返しルール | **RFC 5545 RRULE**（`rrule` ライブラリ） | カレンダー標準の仕様。予定・タスクで同じ仕組みを使う。展開ロジックを自作しない。 |
| プッシュ通知 | **Web Push（VAPID）**、`web-push` ライブラリ | ブラウザ標準。iOS はホーム画面に追加したPWAで対応。Node ランタイムなので `web-push` がそのまま使える。 |
| 通知スケジューラ | **Vercel Cron（日次）+ Upstash QStash（Free）** | Hobby の Cron は1日1回のため、分単位の配信は QStash の遅延配信で行う。無料枠は1日1,000メッセージ・遅延最大7日で、翌日分を予約する設計に足りる。 |
| UI | **MUI（Material UI）最新版** | マテリアルデザインを「書かずに」得るための最有力ライブラリ。 |
| カレンダーUI | MUI Date Pickers（入力）+ 自作の月／週グリッド（MUI部品で構成） | 汎用カレンダーライブラリは要件に対して過剰で見た目の統一が難しいため、表示グリッドのみ自作する。 |
| フォーム | React 標準（`<form>` + `FormData`）+ Zod | フォームライブラリは入れない。必要になったら再検討。 |
| 日付 | `Intl.DateTimeFormat` で表示、計算は **date-fns**（`@date-fns/tz`） | 標準APIを優先しつつ、日付演算はライブラリに任せる。`Temporal` が Safari/Chrome 安定版で使えるようになった時点で移行を検討。 |
| PWA | **`vite-plugin-pwa`**（Workbox）+ Web App Manifest | アプリシェルの precache、Service Worker での push / notificationclick 処理。 |
| テスト | **Vitest**（クライアント: jsdom、サーバー: Node）+ **Playwright**（E2E） | サーバーのテストと E2E は `compose.yaml` の Postgres に対して実行する（ローカルも CI も同じ）。E2E は CI 内で `vite build` した成果物と `server/dev.ts` を起動して行い、Preview URL には依存しない。 |
| Lint / Format | **Biome** | 単一ツールで完結し設定量が少ない。 |
| IaC | **Terraform**（`vercel/vercel`, `neondatabase/neon`, `hashicorp/random` プロバイダ）+ **HCP Terraform（Free）** をリモート state に使用 | Vercel・Neon の全設定をコードとして LLM が確認・編集できるようにする。state を CI から扱うためリモート backend が必要。 |
| CI/CD | **GitHub Actions** — main へのプッシュで Terraform apply → DB マイグレーション → Vercel 本番デプロイを順に実行 | Vercel の Git 連携（自動デプロイ）は使わない。インフラ変更・マイグレーション・デプロイの順序を1つのワークフローで保証するため。 |
| パッケージ管理 | **pnpm** | 高速・厳格。 |

## 6. アーキテクチャ

### 6.1 レイヤー構成

```
[クライアント: React SPA（静的配信）]
  features/*/queries.ts ──(Hono RPC client)──┐
                                             ▼
[Vercel Function: Hono]           routes.ts（Zod検証→Serviceを呼ぶ薄い層）
  MCP tools (mcp.ts) ────────────────────────┤
  Cron / QStash コールバック (通知) ───────────┤
                                             ▼
                                      Service層 ──→ Repository層(Drizzle) ──→ Neon Postgres
                                             ▲
                              shared/ の Zodスキーマ・型（両者で共有）
```

- **UI・MCP・通知処理は同じ Service 層を呼ぶ。** 業務ロジックを複数箇所に書かない。
- Hono のルートと MCP ツールは「入力を Zod で検証して Service を呼ぶ薄い層」に留める。
- Repository 層は Drizzle クエリのみ。ビジネスルールを持たない。
- クライアントは Service 層の結果を表示し、入力を送るだけ。計算（残高・繰り返し展開・タスクの表示位置）をクライアントで再実装しない。
- カレンダー／イベント画面は `calendar` feature の統合 API（`CalendarItem[]`）だけを読む。`CalendarItem` は `kind: 'event' | 'task'` と `placement_date` を持ち、予定とタスクの差はカードの描画と操作（完了ボタンの有無）にのみ現れる。書き込みは `events` / `tasks` の各 API に送る。

### 6.2 ディレクトリ構成（機能単位で凝集）

```
api/
  [[...route]].ts             # Vercel Function のエントリ。server/app.ts を hono/vercel で export するだけ
src/                          # クライアント（Vite + React）
  main.tsx  router.tsx  sw.ts（Service Worker: push / notificationclick）
  routes/                     # TanStack Router ファイルベースルート。ページはfeaturesの部品を組み立てるだけ
    __root.tsx  index.tsx  login.tsx  calendar.tsx  events.tsx
    expenses.tsx  lemon.tsx  settings.tsx  admin.users.tsx
  features/                   # 機能ごとのUI
    calendar/ (月／週グリッド・時系列リスト。予定とタスクの両方を描画する)
    events/   (components/, queries.ts, __tests__/)   # 予定のフォーム・カード
    tasks/    (タスクのフォーム・カード・完了操作)
    expenses/  lemon/  users/  dashboard/
  lib/                        # 横断
    api.ts（Hono RPC client）  query-client.ts（永続化設定）  theme.ts  push.ts  date.ts
    ui/（AppShell, ナビゲーション, 共通部品）
server/                       # サーバー（Hono）
  app.ts                      # ルート登録・ミドルウェア（認証、QStash署名検証、Cron secret）
  dev.ts                      # ローカル起動用（@hono/node-server）
  features/                   # 1機能=1ディレクトリ
    events/
      schema.ts               # Drizzleテーブル定義
      repository.ts           # DBアクセス
      service.ts              # 業務ロジック（繰り返し展開を含む）
      routes.ts               # Honoルート（Zod検証→service）
      mcp.ts                  # MCPツール定義
      dashboard.ts            # ホーム画面への指標提供（§6.3）
      notifications.ts        # 通知対象の列挙と配信時再検証（§6.3）
      __tests__/
    tasks/  expenses/  lemon/  users/     # 同じ構造（不要なファイルは省略可）
    calendar/                 # 予定とタスクを統合した「カレンダー項目」を返す読み取り専用の機能
      service.ts              # events / tasks の service を呼び、§4.3 の規則で placement_date を付与して統合
      routes.ts               # GET /api/calendar/items?from&to
  lib/
    db.ts（Drizzle + Neon）  schema.ts（全featureのschemaを集約）  auth.ts（better-auth）
    mcp/（server.ts=全featureのmcp.tsを登録）  push/（購読管理・送信）  qstash.ts（予約・署名検証）
    recurrence/（RRULE展開・例外適用）  dashboard/（registry）  notifications/（registry, enqueue, deliver）
shared/                       # クライアント・サーバー共通
  validation/<feature>.ts     # Zodスキーマ（入力）
  types.ts  constants.ts
drizzle/                      # マイグレーションSQL（生成物・コミットする）
infra/                        # Terraform（§13.1）
  main.tf  providers.tf  variables.tf  outputs.tf
  vercel.tf                   # プロジェクト・ドメイン・環境変数
  neon.tf                     # プロジェクト・ブランチ・DB・ロール
  secrets.tf                  # random_password による内部シークレットの生成
.github/workflows/
  ci.yml                      # PR: typecheck / lint / test / terraform plan / Neonブランチ作成 / migrate / Preview デプロイ
  deploy.yml                  # main: terraform apply → migrate → 本番デプロイ
  preview-cleanup.yml         # PR クローズ: Neon の Preview ブランチ削除
scripts/create-user.ts  scripts/generate-vapid-keys.ts
docs/architecture.md  docs/data-model.md  docs/decisions.md  docs/features/<name>.md（§0 で生成）
e2e/
CLAUDE.md  AGENTS.md（→CLAUDE.md）  compose.yaml（ローカル Postgres）  .env.example  .node-version
vercel.json（cron 定義・rewrites）  vite.config.ts  drizzle.config.ts  biome.json  renovate.json
tsconfig.base.json  tsconfig.client.json  tsconfig.server.json  tsconfig.shared.json
```

- ローカル開発は `vite dev`（`/api` を `server/dev.ts` へプロキシ）で行い、`vercel dev` に依存しない。
- 静的ファイルは Vite の `dist/` を Vercel が配信し、SPA のフォールバック（全パス→`index.html`）は `vercel.json` の rewrites で設定する。`/api/*` は Vercel のファイルシステムルーティングで `api/[[...route]].ts` に到達するので、rewrite の対象から除外する。
- Cron は `vercel.json` の `crons` に UTC で書く（00:00 JST = `0 15 * * *`）。

### 6.3 拡張ポイント（機能追加を「登録」で済ませる仕組み）

横断的な処理（ホーム・通知・MCP）が個別機能を知らなくて済むよう、各機能が共通インターフェースを実装して登録する。

```ts
// server/lib/dashboard/types.ts
export type DashboardWidget = {
  id: string;
  order: number;
  load: (ctx: { userId: string }) => Promise<DashboardCardData>;
};

// server/lib/notifications/types.ts
export type NotificationSource = {
  id: string;
  /** 指定期間に発火すべき通知を列挙する（keyは冪等性のための一意キー） */
  list: (range: { from: Date; to: Date }) => Promise<PlannedNotification[]>;
  /** 配信直前に再検証する（削除・変更されていれば null） */
  resolve: (key: string) => Promise<NotificationPayload | null>;
};
```

- `server/features/*/dashboard.ts` が `DashboardWidget` を、`server/features/*/notifications.ts` が `NotificationSource` を export し、各 registry に列挙する。MCPツールも `server/features/*/mcp.ts` を `server/lib/mcp/server.ts` で登録する。
- 新機能の追加は「feature ディレクトリを（クライアントとサーバーに）作り、registry に1行ずつ足す」で完了する。

## 7. データモデル（初期案）

共通規約（Postgres）:
- 主キーは `uuid`。アプリ側で UUID v7 を生成する（時系列ソート可能）。
- 日時は `timestamptz`（UTC保存、表示時にJST変換）。日付のみは `date`。
- 金額は `integer`（円）。
- 全テーブルに `created_at`, `updated_at`, `created_by`（users参照）。
- 論理削除は使わない。

| テーブル | 主な列 | 備考 |
|---|---|---|
| `users` / `sessions` / `accounts` / OAuth関連 | better-auth 管理 | `users.name` を表示名として使う（「自分／相手」の表示に用いる） |
| `push_subscriptions` | `user_id`, `endpoint`(unique), `p256dh`, `auth`, `user_agent` | 端末ごとに1行。配信失敗（410/404）で削除 |
| `events` | `title`, `starts_at`, `ends_at`, `all_day`, `owner_user_id` (null=共有), `location`, `note`, `rrule` (null=単発), `remind_before_minutes` (null=通知なし。**既定は null**。選択肢: 0 / 5 / 10 / 15 / 30 / 60 / 120 / 1440 分前) | 予定。終日は `all_day=true` かつ `starts_at`=JST 0:00、`ends_at`=翌日 JST 0:00（終端は排他的） |
| `event_overrides` | `event_id`, `occurrence_start`(元の開始日時), `cancelled`, `starts_at`, `ends_at`, `title`, `note` | 繰り返し予定の個別変更・削除（RFC 5545 の RECURRENCE-ID 相当）。unique(`event_id`, `occurrence_start`) |
| `tasks` | `title`, `note`, `assignee_user_id` (null=共有), `starts_at`, `due_at`, `rrule`, `notify_at_start`, `notify_at_due` | タスク。`starts_at`/`due_at` はいずれも任意。`rrule` を持つ場合は `starts_at` または `due_at` の少なくとも一方が必須（DTSTART になる）。繰り返しでは両方の日時が発生ごとに同じ間隔でずれる |
| `task_overrides` | `task_id`, `occurrence_key`, `cancelled`, `title`, `note`, `starts_at`, `due_at` | 繰り返しタスクの特定の回だけの変更・取り消し（`event_overrides` と同じ仕組み）。unique(`task_id`, `occurrence_key`) |
| `task_completions` | `task_id`, `occurrence_key`, `completed_at`, `completed_by` | `occurrence_key` は単発なら `'single'`、繰り返しなら発生の基準日時の ISO 8601（UTC）。unique(`task_id`, `occurrence_key`) |
| `expenses` | `paid_by`(user), `amount`, `description`, `spent_on` | 立替。常に折半 |
| `settlements` | `from_user`, `to_user`, `amount`, `settled_on` | 精算 |
| `lemon_care_logs` | `care_type` (`water` 水やり / `mist` 葉水 / `fertilize` 施肥 / `bloom` 開花 / `harvest` 収穫 / `note` メモ), `done_at`, `note` | `note` 種別は本文必須。他の種別は本文任意。植物を増やす場合は `plants` テーブルと `plant_id` を追加して拡張する |
| `sent_notifications` | `key`(PK), `sent_at` | 送信済み通知の台帳（QStash の再送時の重複防止）。古い行は日次 Cron で削除 |

計算ルール:
- 立替残高（AがBに対して持つ債権）= (ΣA立替 − ΣB立替) / 2 − ΣA→B精算 + ΣB→A精算。端数は切り捨て。
- 繰り返しの展開は `server/lib/recurrence` で行い、DBには発生行を作らない（マスター + 例外／完了 で表現する）。展開は要求された期間内に限り、RRULE の `UNTIL`/`COUNT` を尊重する。RRULE は `Asia/Tokyo` の壁時計で評価する（DST なし）。
- 繰り返しタスクの表示対象（最大2つ）と放棄の判定は §4.3 の規則で `calendar` service が算出する。展開は「未完了の発生を基準日時順に走査し、2つ見つかるか、2つ後の発生が今日以前になった時点で打ち切る」。
- タスクの `placement_date` は保存せず、`calendar` service が §4.3 の規則で毎回算出する（「今日」に依存するため保存すると陳腐化する）。
- 繰り返し予定・タスクの編集は「この回だけ」「これ以降すべて」「すべて」の3択。「この回だけ」は `event_overrides` / `task_overrides`、「これ以降すべて」は元の `rrule` に `UNTIL` を付けて新しいマスターを作る、「すべて」はマスターを更新する。

## 8. 認証・認可・MCP

- Web: better-auth のセッション Cookie（同一オリジン）。Hono の認証ミドルウェアで `/api/*` を保護し、クライアント側は未認証レスポンスを受けたら `/login` へ遷移する。**サーバー側の検証が唯一の防御線**であり、クライアント側のルートガードは UX のためだけに置く。
- 権限: 全ユーザー管理者のため認可ロジックは書かない。ただし「誰が作成したか」は必ず記録する。
- パスワード: better-auth 標準のハッシュ。最低12文字。`scripts/create-user.ts` は better-auth のハッシュ関数を使い、`DATABASE_URL` に直接接続して投入する。
- MCP:
  - エンドポイント `/api/mcp`、Streamable HTTP、ステートレス。
  - 認可は **OAuth 2.1 のみ**（MCP仕様の標準。Dynamic Client Registration・PKCE対応）。better-auth の `mcp` プラグインで LifeHub 自身を認可サーバーにする。**実装時に better-auth・`@hono/mcp`・MCP 仕様の最新の対応状況を必ず確認すること。**
  - 初期ツール（命名 `<feature>_<verb>_<object>`）:
    `events_list`, `events_create`, `events_update`, `events_delete`,
    `tasks_list`, `tasks_create`, `tasks_complete`, `tasks_update`,
    `calendar_list_items`（予定＋タスクの統合、§4.3 の位置付き）,
    `expenses_get_balance`, `expenses_add`, `expenses_settle`,
    `lemon_get_status`, `lemon_log_care`
  - ツールの説明文はAIが正しく使えるよう具体的に書く。引数スキーマは `shared/validation` の Zod を共有する。

## 9. プッシュ通知

- 通知内容:
  - 予定: 開始の `remind_before_minutes` 前。予定ごとに選択し、**既定は通知なし**。
  - タスク: `starts_at` と `due_at` それぞれの時刻ちょうど（各フラグで個別にON/OFF）。
- 送信先: `owner_user_id` / `assignee_user_id` が指定されていればその人の全端末、null（共有）なら2人の全端末。
- 仕組み（「予約は使い捨て、配信時に再検証」方式 — 予定の変更・削除のたびに予約をキャンセルする処理を書かなくて済むようにするため）:
  1. Vercel Cron（日次 00:00 JST）が `/api/notifications/enqueue` を呼ぶ（`CRON_SECRET` で保護）。全 `NotificationSource` から翌日分を列挙し、QStash に配信時刻付きで予約する。`deduplicationId` = 通知キー（例 `event:<id>:<occurrence>`）で重複を防ぐ。
  2. 予定・タスクの作成／変更で当日〜翌日に新たな通知が発生する場合は、その場で同様に予約する（dedupe により重複しない）。
  3. 配信時刻に QStash が `/api/notifications/deliver` を呼ぶ。QStash の署名を検証後、`resolve(key)` で対象を再読込し、削除・変更済みなら送らない。`sent_notifications` に無い key のみ送信し、送信後に記録する。
  4. `web-push` で各購読へ送信。410/404 は購読を削除する。Service Worker が通知を表示し、タップで該当画面を開く。
- 購読: `/settings` で「この端末で通知を受け取る」を押すと Notifications API の許可 → PushManager 購読 → サーバーに保存。iOS はホーム画面追加後のみ有効であることをUIで案内する。
- VAPID 鍵・QStash トークン・署名鍵は Vercel の環境変数（Sensitive）で管理する。

## 10. オフラインと起動速度

- アプリシェル（HTML/JS/CSS/アイコン）は Service Worker で precache し、2回目以降はネットワークを待たずに起動する。更新は「新版を検知したらバックグラウンドで取得し、次回起動で切替」（Workbox の `autoUpdate`）。
- TanStack Query のキャッシュを IndexedDB に永続化し、起動直後は前回のデータを即表示してからバックグラウンドで再取得する（stale-while-revalidate）。Neon のコールドスタートはこの仕組みで体感上吸収する。
- オフライン時は**閲覧のみ**。書き込み操作はオフライン中は無効化し、その旨を表示する。オフライン書き込み（キューして再送）は将来の拡張とし、初期スコープに含めない。
- API レスポンスは Service Worker でキャッシュしない（データの正は TanStack Query の永続キャッシュに一本化する）。

## 11. UI / UX 方針

- マテリアルデザインをベースにした、シンプルで洗練されたUI。装飾は最小限。
- **アクセントカラー: 赤紫 `#A0148C`**（MUI theme `primary.main`）。ダークモードでは `primary.main` を `#D06AC0` 程度に明るくする。secondary は使わず、強調はすべて primary で統一する。
- ダークモード対応（`prefers-color-scheme` 追従、MUI の CSS 変数テーマで切替時のちらつきを避ける）。
- レスポンシブ: モバイルファースト。スマホでは下部ナビゲーション（BottomNavigation）、PCではサイドナビ（permanent Drawer）に切り替える。ページ自体は共通。
- 入力は極力少ないタップで完了させる（ホームのクイック追加、既定値の自動入力、日付は今日を初期値）。
- 更新系は TanStack Query の mutation で行い、成功後に関連クエリを invalidate する。楽観的更新は必要になるまで入れない。
- フォント: システムフォント（`system-ui`）。Webフォントは読み込まない。

## 12. PWA

- Web App Manifest（`name: LifeHub`, `display: standalone`, `theme_color` = `#A0148C`, アイコン 192/512/maskable）。
- iOS向け: `apple-mobile-web-app-*` メタ、`apple-touch-icon`。
- Service Worker（`vite-plugin-pwa`, `injectManifest` 方式で `src/sw.ts` を自前管理）: precache、`push` / `notificationclick` の処理。

## 13. 運用

原則: **インフラの設定はすべて `infra/` の Terraform に書き、ダッシュボードで直接変更しない。** デプロイは **main ブランチへのプッシュ**で完結する。手動作業は「アカウント単位の資格情報を GitHub Secrets に登録する」初回セットアップだけに限定する。

### 13.1 Terraform（`infra/`）

| 対象 | リソース | 備考 |
|---|---|---|
| Vercel プロジェクト | `vercel_project` | フレームワーク `vite`、ビルド設定、`git_repository` は設定しない（自動デプロイを無効化し、デプロイは GitHub Actions が行う） |
| ドメイン | `vercel_project_domain`（`lifehub.crat.jp`） | 外部DNSへの CNAME 登録は手動（Terraform 対象外）。登録先の値は `terraform output` で確認する |
| 環境変数 | `vercel_project_environment_variable` | `DATABASE_URL`（Neon の出力）、`BETTER_AUTH_SECRET`・`CRON_SECRET`（`random_password` で生成）、`QSTASH_*`・`VAPID_*`（変数から）。すべて `sensitive` |
| Neon | `neon_project`, `neon_branch`（`main` と `dev`）, `neon_database`, `neon_role`, `neon_endpoint` | `dev` ブランチはローカル開発用。PR ごとの Preview ブランチは寿命が短いため Terraform ではなく GitHub Actions が作成・削除する |
| 内部シークレット | `random_password` | Terraform が生成し state に保持する。人が値を知る必要がない |
| Preview 保護 | `vercel_project.vercel_authentication`（`standard_protection`） | Preview URL を Vercel 認証で保護する |
| 出力 | `outputs.tf`: `vercel_org_id`, `vercel_project_id`, `dns_cname_target`, `database_url`(sensitive), `neon_project_id` | GitHub Actions と初回セットアップ（§13.4）が参照する |

- **Terraform の入力（変数）として外部から渡すもの**: Vercel API トークン、Neon API キー、QStash トークンと署名鍵（Upstash コンソールで取得）、VAPID 鍵ペア（`scripts/generate-vapid-keys.ts` で一度だけ生成）。これらは GitHub Secrets → `TF_VAR_*` として渡す。
- **Terraform 対象外**: Vercel Cron の定義（`vercel.json`、アプリのコード）、外部DNSの CNAME、DB マイグレーション、初期ユーザー作成、Vercel Marketplace 連携（使わず Neon を直接管理する）。
- state は HCP Terraform（Free）のワークスペースにリモート保存し、GitHub Actions からは `TF_API_TOKEN` で接続する。
- プロバイダの更新は Renovate の PR で行い、**CI では `terraform init -upgrade` を使わない**（Neon 公式が警告するリソース再作成事故を防ぐ）。PR の `terraform plan` に replace が含まれる場合はマージしない。

### 13.2 環境

| 環境 | ブランチ | DB | 用途 |
|---|---|---|---|
| `production` | main | Neon `main` ブランチ | 本番 `https://lifehub.crat.jp` |
| `preview` | PR | **PR ごとに作る Neon ブランチ**（`preview/pr-<番号>`、`main` から分岐） | PR ごとの Vercel Preview URL。本番相当のデータでマイグレーションと動作を確認する |
| `local` | — | Neon `dev` ブランチ または Docker の Postgres | `vite dev` + `server/dev.ts` |

環境変数は `.env.example` に一覧する。ローカルは `.env.local`。

### 13.3 デプロイフロー（GitHub Actions）

**PR（`ci.yml`）**、以下を実行し、最後に Preview URL を PR コメントに投稿する:
1. `typecheck` → `lint` → `test`
2. `terraform plan`（結果を PR コメントに投稿。差分が意図通りか、replace が無いかを人と LLM が確認する）
3. Neon ブランチ `preview/pr-<番号>` を `main` から作成（既にあれば再利用。Neon 公式の `neondatabase/create-branch-action` を使う）
4. そのブランチに `drizzle-kit migrate` を適用（本番相当のデータに対してマイグレーションを検証する）
5. `vercel pull --environment=preview` → `vercel build` → `vercel deploy --prebuilt` に `--env DATABASE_URL=<PR ブランチの接続文字列>` を付けて Preview デプロイ
6. Preview URL と Neon ブランチ名を PR コメントに投稿（更新時は同じコメントを書き換える）

**PR クローズ／マージ（`preview-cleanup.yml`）**: Neon ブランチ `preview/pr-<番号>` を削除（`neondatabase/delete-branch-action`）。Vercel の Preview デプロイは Vercel 側の保持ポリシーに任せる。

Preview 環境の挙動:
- Preview の環境変数は Terraform の `vercel_project_environment_variable`（target = `preview`）で管理し、`DATABASE_URL` だけをデプロイ時に PR ブランチの値で上書きする。
- `VERCEL_ENV !== 'production'` のとき、日次 Cron の通知予約と QStash への publish を無効化する（Preview から本番と同じ通知が二重に飛ぶのを防ぐ）。配信コールバックの署名検証は Preview でも行う。
- better-auth の `baseURL` は `VERCEL_URL` から導出し、Preview URL でもログインと MCP の OAuth が動くようにする。Preview は Vercel の Deployment Protection（Vercel 認証）を有効にし、外部からアクセスできないようにする。
- Neon ブランチは PR ごとに作るが、ブランチはコピーオンライトで無料枠のストレージをほとんど消費しない。Free プランのブランチ数上限（10）を超えないよう、クローズ時の削除を必ず行う。

**main へのプッシュ（`deploy.yml`）**、以下を直列に実行:
1. `terraform apply -auto-approve`（`infra/` に変更が無ければ no-op）
2. `drizzle-kit migrate`（`DATABASE_URL` は `terraform output` から取得）
3. `vercel pull --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod`

- `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` は `terraform output` から取得し、ワークフロー内で環境変数に設定する（GitHub Secrets に重複保持しない）。
- マイグレーションは後方互換を保つ（列削除は「アプリが参照をやめたデプロイ」の次のデプロイで行う）。順序を守っても、旧コードが数秒間新スキーマに触れる可能性があるため。
- ロールバックはアプリ側は `vercel rollback`、インフラ側は Terraform の変更を revert してプッシュ。

### 13.4 初回セットアップ（人が一度だけ行う手作業）

1. アカウント作成: Vercel（Hobby）、Neon、Upstash、HCP Terraform、GitHub リポジトリ。いずれもカード登録不要。
2. トークン発行: Vercel API トークン、Neon API キー、HCP Terraform の API トークン（ワークスペース `lifehub` を作成し、Execution Mode を **Local** にする。plan/apply は GitHub Actions 側で走らせるため）。
3. Upstash コンソールで QStash を有効化し、トークンと Current/Next Signing Key を控える。
4. `pnpm vapid:generate` で VAPID 鍵ペアを生成する。
5. 上記を GitHub Secrets に登録する:
   `VERCEL_TOKEN`, `NEON_API_KEY`, `TF_API_TOKEN`, `TF_VAR_qstash_token`, `TF_VAR_qstash_current_signing_key`, `TF_VAR_qstash_next_signing_key`, `TF_VAR_vapid_public_key`, `TF_VAR_vapid_private_key`
6. main へ最初のプッシュ → `deploy.yml` が Terraform apply を実行し、Vercel プロジェクトと Neon プロジェクトが作られる。
7. `terraform output dns_cname_target` の値を、外部 DNS の `lifehub.crat.jp` CNAME に登録する。
8. `pnpm user:create --email ... --name ...` を本番の `DATABASE_URL` に対して実行し、最初のユーザーを作る（`DATABASE_URL` は `terraform output -raw database_url`）。
9. ブラウザでログインし、`/admin/users` から2人目を登録する。

### 13.5 バックアップと制約

- バックアップ: Neon の PITR（Free は履歴保持期間が短い）に依存。加えて月次で `pg_dump` を手動取得する運用を検討。
- 無料枠の制約を意識する: Vercel Hobby は Cron 日次のみ・関数実行時間に上限・非商用限定、Neon Free はコンピュート自動停止・ストレージ上限、QStash Free は1日1,000メッセージ・遅延最大7日、HCP Terraform Free はリソース数上限（本構成は十分に収まる）。

## 14. 品質基準

- TypeScript `strict: true`、`any` 禁止、`noUncheckedIndexedAccess: true`。クライアント・サーバー・shared で tsconfig を分け、サーバーに DOM 型を、クライアントに Node 型を混入させない。
- Biome で lint/format をCIで強制。警告ゼロを維持。
- テスト: Service層（特に繰り返し展開・残高計算・通知列挙）はユニットテスト必須。主要導線（ログイン→記録追加→ホーム反映）はE2E。
- CI（GitHub Actions）: §13.3 のとおり。PR では `terraform plan` の結果も必ずレビュー対象にする。
- Terraform も品質基準の対象: `terraform fmt -check` と `terraform validate` を CI で強制する。
- コミットは Conventional Commits。PR単位で機能を追加する。
- 依存関係は Renovate で定期更新し、常に最新安定版に追従する。

## 15. 機能追加の手順（AIエージェント向けチェックリスト）

1. `docs/features/<name>.md` に要件（目的・画面・データ・MCPツール・通知）を1ページで書く。
2. `shared/validation/<name>.ts` に Zod スキーマを書く。
3. `server/features/<name>/` を §6.2 の構成で作成する。既存機能（例: `tasks`）をひな形にする。`schema.ts` → `server/lib/schema.ts` に追加 → `drizzle-kit generate`。
4. `repository.ts` → `service.ts` → `routes.ts` の順に実装し、`server/app.ts` にルートを登録する。
5. `dashboard.ts` / `notifications.ts` / `mcp.ts` を実装し、各 registry に登録する。
6. `src/features/<name>/` に `queries.ts`（Hono RPC 経由）と `components/` を作り、`src/routes/` にページを追加、ナビゲーションに登録する。
7. ユニットテストとE2Eを追加する。
8. `docs/features/<name>.md`・`docs/data-model.md`・MCP ツール一覧（`docs/features/mcp.md`）を更新する。

## 16. 決定済み事項の記録

| 項目 | 決定 |
|---|---|
| アプリ名 / ドメイン | LifeHub / `lifehub.crat.jp`（外部DNSから CNAME） |
| インフラ | Vercel Hobby + Neon Free + Upstash QStash Free（すべて無料枠）。**Terraform（HCP Terraform Free の state）で管理**し、ダッシュボードでの直接変更は禁止 |
| デプロイ | main へのプッシュで GitHub Actions が Terraform apply → マイグレーション → Vercel 本番デプロイ。Vercel の Git 自動デプロイは使わない |
| 構成 | React SPA（Vite）+ Hono（Vercel Function 1つ）。Next.js は不採用（オフライン対応と両立しにくいため） |
| Cloudflare | 不採用。Workers の独自ドメインには `crat.jp` ゾーン全体の移管が必要で、権威DNSを変えられないため |
| カレンダーとイベント | 同一データ。イベント画面はカレンダーの高機能な時系列ビュー |
| Googleカレンダー連携 | 当面なし |
| 立替の分担 | 常に折半 |
| MCP認可 | OAuth 2.1 のみ |
| 繰り返し | 予定・タスクともに対応（RRULE） |
| タスク | 買い物メモを廃止しタスク管理に抽象化。開始日時と期限日時を別々に持つ。専用画面は持たず、カレンダー／イベント画面に予定と並べて表示（§4.3） |
| 植物の記録項目 | 水やり・葉水・施肥・開花・収穫・メモ。対象はレモンの木1本に固定（複数植物は必要になったら拡張） |
| プッシュ通知 | 予定の開始前、タスクの開始日時・期限日時。日次 Cron で QStash に予約し、配信時に再検証 |
| オフライン | 閲覧のみ対応。書き込みのオフライン対応は将来検討 |
| 写真添付 | なし |
| アクセント色 | `#A0148C`（変更可） |
| 予定のリマインド | 予定ごとに選択（0/5/10/15/30/60/120/1440分前）。既定は通知なし |
| 繰り返しタスクの表示 | 同時に最大2つ。未完了の発生は2つ後の発生が来た時点で放棄（§4.3） |
| 繰り返しタスクの個別編集 | 特定の回だけの変更・取り消しに対応（`task_overrides`） |
| ホームの「次の予定」件数 | 5件 |
| イベント画面の初期範囲 | 今日から前後7日 |
| パスワード最低長 | 12文字 |
| 立替の端数 | 切り捨て |
| Preview の保護 | Vercel Deployment Protection（Vercel 認証） |

## 17. 実装マイルストーン（この順で進める）

各マイルストーンの完了条件は「CI が通り、main にマージされ、本番で動作確認できること」。

| # | 内容 | 完了条件 |
|---|---|---|
| M0 | §0 のドキュメント群の生成、リポジトリ骨格: pnpm / Vite+React / Hono / Drizzle / Biome / Vitest / Playwright / tsconfig 分割 / `compose.yaml` / CI（PR・main の両ワークフロー） / Terraform（Vercel・Neon） | `lifehub.crat.jp` で "Hello" が表示され、`/api/health` が DB に接続できる |
| M1 | 認証と管理: better-auth（メール＋パスワード）、`/login`、`/admin/users`、`scripts/create-user.ts`、AppShell（ナビゲーション・テーマ・ダークモード） | 2人がログインでき、未認証は弾かれる |
| M2 | 予定: `events` の CRUD、繰り返し（RRULE・例外）、カレンダー画面（月／週）、イベント画面 | 繰り返し予定を作成・個別変更・削除できる |
| M3 | タスク: `tasks` の CRUD、繰り返し、完了、§4.3 の表示規則、カレンダー／イベント画面への統合、`calendar` feature | タスクが予定と並んで表示され、カレンダーから完了できる |
| M4 | 立替・精算、レモンの記録、ホーム（4カード＋クイック追加） | ホームから全種類の記録を追加できる |
| M5 | PWA とオフライン: manifest、Service Worker、TanStack Query の永続化、オフライン時の書き込み無効化 | iPhone/Android でインストールでき、機内モードで閲覧できる |
| M6 | プッシュ通知: 購読、`/settings`、Cron + QStash、配信、Preview での無効化 | 予定30分前とタスクの期限に通知が届く |
| M7 | MCP: OAuth 2.1、`/api/mcp`、§8 のツール一式 | Claude から予定を追加・タスクを完了できる |

## 18. コマンド一覧（`package.json` scripts）

| コマンド | 内容 |
|---|---|
| `pnpm dev` | `compose.yaml` の Postgres を前提に、`vite dev` と `server/dev.ts` を同時起動 |
| `pnpm build` | クライアントの `vite build`（サーバーは Vercel のビルドに任せる） |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm e2e` | 品質チェック。CI と同じものをローカルで実行 |
| `pnpm db:generate` / `pnpm db:migrate` | drizzle-kit のマイグレーション生成／適用 |
| `pnpm user:create` | 初期ユーザー作成 |
| `pnpm vapid:generate` | VAPID 鍵ペア生成 |
| `pnpm tf:plan` / `pnpm tf:apply` | `infra/` の Terraform（ローカルから手動で実行する場合。通常は CI に任せる） |
