# LifeHub

家庭で使うあらゆるツールを 1 つにまとめた Web アプリ。予定・タスク・立替精算・レモンの木の世話記録を、スマホ（PWA）・PC・AI ツール（MCP）から扱う。

- 公開 URL: https://lifehub.crat.jp
- 利用者は 2 人。全員が管理者。言語は日本語、タイムゾーンは `Asia/Tokyo` 固定。
- 設計・規約は [docs/architecture.md](docs/architecture.md)、データは [docs/data-model.md](docs/data-model.md)、各機能は [docs/features/](docs/features/) を参照。
- 開発ルールは [AGENTS.md](AGENTS.md)（`CLAUDE.md` はそのシンボリックリンク）。

## 技術スタック

React + TypeScript + Vite の SPA（TanStack Router / Query, MUI）と、Hono の API（Vercel Function 1 つ）。DB は Neon Postgres + Drizzle ORM。認証は better-auth。詳細と採用理由は [docs/architecture.md](docs/architecture.md#技術スタック)。

## ローカル開発

前提: Node.js（`.node-version` のバージョン）、pnpm、Docker（ローカル Postgres 用）。

```sh
pnpm install
cp .env.example .env.local        # 必要なら値を編集
docker compose up -d              # Postgres を起動
pnpm db:migrate                   # スキーマを適用
pnpm user:create --email you@example.com --name あなた --password 'xxxxxxxxxxxx'
pnpm dev                          # http://localhost:5173
```

`vite dev` が `/api` を `server/dev.ts`（http://localhost:3000）へプロキシする。`vercel dev` は使わない。

## コマンド一覧

| コマンド | 内容 |
|---|---|
| `pnpm dev` | `compose.yaml` の Postgres を前提に、`vite dev` と `server/dev.ts` を同時起動 |
| `pnpm build` / `pnpm preview` | クライアントの `vite build`（サーバーは Vercel のビルドに任せる）と、その成果物のプレビュー |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm e2e` | 品質チェック。CI と同じものをローカルで実行（単体テストの監視実行は `pnpm test:watch`） |
| `pnpm format` | Biome でフォーマットと自動修正 |
| `pnpm db:generate` / `pnpm db:migrate` | drizzle-kit のマイグレーション生成／適用 |
| `pnpm db:studio` | drizzle-kit studio でローカルの DB を見る |
| `pnpm user:create` | 初期ユーザー作成（`--email` `--name` `--password`） |
| `pnpm db:seed` | ローカル用のサンプルデータ投入（全テーブルを空にしてから。本番では実行できない） |
| `pnpm vapid:generate` | VAPID 鍵ペア生成 |
| `pnpm icons:generate` | `public/icons/favicon.svg` から PWA アイコンの PNG を生成 |
| `pnpm tf:plan` / `pnpm tf:apply` | `infra/` の Terraform（ローカルから手動で実行する場合。通常は CI に任せる） |

## 初回セットアップ（人が一度だけ行う手作業）

インフラの設定はすべて `infra/` の Terraform に書き、ダッシュボードで直接変更しない。デプロイは main ブランチへのプッシュで完結する。

1. アカウント作成: Vercel（Hobby）、Neon、Upstash、HCP Terraform、GitHub リポジトリ。いずれもカード登録不要。
2. トークン発行: Vercel API トークン、Neon API キー、HCP Terraform の API トークン（organization `macrat` にワークスペース `lifehub` を作成し、Execution Mode を **Local** にする。plan/apply は GitHub Actions 側で走らせるため）。トークンはワークスペースの state をロックできる **User token か Team token** を使う（Organization token は state 操作に使えず、`Error acquiring the state lock: resource not found` になる）。
3. Upstash コンソールで QStash を有効化し、トークンと Current/Next Signing Key を控える。
4. `pnpm vapid:generate` で VAPID 鍵ペアを生成する。
5. 上記を GitHub Secrets に登録する:
   `VERCEL_TOKEN`, `NEON_API_KEY`, `TF_API_TOKEN`, `TF_VAR_qstash_token`, `TF_VAR_qstash_current_signing_key`, `TF_VAR_qstash_next_signing_key`, `TF_VAR_vapid_public_key`, `TF_VAR_vapid_private_key`
6. main へ最初のプッシュ → `deploy.yml` が Terraform apply を実行し、Vercel プロジェクトと Neon プロジェクトが作られる。
7. `terraform output dns_cname_target` の値を、外部 DNS の `lifehub.crat.jp` CNAME に登録する。
8. `pnpm user:create --email ... --name ... --password ...` を本番の `DATABASE_URL` に対して実行し、最初のユーザーを作る（`DATABASE_URL` は `terraform output -raw database_url`）。
9. ブラウザでログインし、`/admin/users` から 2 人目を登録する。

## 環境

| 環境 | ブランチ | DB | 用途 |
|---|---|---|---|
| `production` | main | Neon `main` ブランチ | 本番 https://lifehub.crat.jp |
| `preview` | PR | PR ごとに作る Neon ブランチ（`preview/pr-<番号>`） | PR ごとの Vercel Preview URL |
| `local` | — | Neon `dev` ブランチ または Docker の Postgres | `pnpm dev` |

環境変数の一覧は [.env.example](.env.example)。
