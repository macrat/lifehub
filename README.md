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
| `pnpm db:dump <file>` / `pnpm db:restore <file>` | `DATABASE_URL` の DB をまるごと SQL に書き出す／書き出した SQL を戻す（`pg_dump` / `psql` を使う。[バックアップ](#バックアップ)） |
| `pnpm user:create` | 初期ユーザー作成（`--email` `--name` `--password`） |
| `pnpm calendar:export <file>` | `DATABASE_URL` の DB にある全員の全予定を ics に書き出す |
| `pnpm db:seed` | ローカル用のサンプルデータ投入（全テーブルを空にしてから。本番では実行できない） |
| `pnpm vapid:generate` | VAPID 鍵ペア生成 |
| `pnpm icons:generate` | `public/icons/` の SVG と MUI のアイコンから PWA アイコン（アプリ・通知・ショートカット）の PNG を生成 |
| `pnpm tf:plan` / `pnpm tf:apply` | `infra/` の Terraform（ローカルから手動で実行する場合。通常は CI に任せる） |

## 初回セットアップ（人が一度だけ行う手作業）

インフラの設定はすべて `infra/` の Terraform に書き、ダッシュボードで直接変更しない。デプロイは main ブランチへのプッシュで完結する。

1. アカウント作成: Vercel（Hobby）、Neon、Upstash、HCP Terraform、GitHub リポジトリ。いずれもカード登録不要。
2. ID の確認: Neon の組織 ID（コンソールの Organization settings。`org-...`）と Vercel のチーム slug または ID（Team Settings → General。Hobby でもアカウントはチームとして扱われる）。
3. トークン発行: Vercel API トークン（スコープにそのチームを含める）、Neon API キー、HCP Terraform の API トークン（organization `macrat` にワークスペース `lifehub` を作成し、Execution Mode を **Local** にする。plan/apply は GitHub Actions 側で走らせるため）。トークンはワークスペースの state をロックできる **User token か Team token** を使う（Organization token は state 操作に使えず、`Error acquiring the state lock: resource not found` になる）。
4. Upstash コンソールで QStash を有効化し、**US（us-east-1）リージョン**のトークンと Current/Next Signing Key を控える（リージョンごとにアカウント・トークン・署名鍵が独立していて、コードは US のエンドポイントに固定してある。`server/lib/qstash.ts`）。
5. `pnpm vapid:generate` で VAPID 鍵ペアを生成する。
6. 上記を GitHub Secrets に登録する:
   `VERCEL_TOKEN`, `NEON_API_KEY`, `TF_API_TOKEN`, `TF_VAR_neon_org_id`, `TF_VAR_vercel_team`, `TF_VAR_qstash_token`, `TF_VAR_qstash_current_signing_key`, `TF_VAR_qstash_next_signing_key`, `TF_VAR_vapid_public_key`, `TF_VAR_vapid_private_key`
7. main へ最初のプッシュ → `deploy.yml` が Terraform apply を実行し、Vercel プロジェクトと Neon プロジェクトが作られる。
8. `terraform output dns_cname_target` の値を、外部 DNS の `lifehub.crat.jp` CNAME に登録する。
9. `pnpm user:create --email ... --name ... --password ...` を本番の `DATABASE_URL` に対して実行し、最初のユーザーを作る（`DATABASE_URL` は `terraform output -raw database_url`）。
10. ブラウザでログインし、`/admin/users` から 2 人目を登録する。

## バックアップ

`.github/workflows/backup.yml` が毎日 JST 4:00 に本番 DB を Artifact（`backup-<JST の日付>`、30 日保持）に置く。手動でも実行できる（Actions の画面から `Run workflow`）。

- `lifehub.sql`: DB まるごとのダンプ（`pnpm db:dump`）。スキーマ・データ・マイグレーションの記録を含む。
- `lifehub.ics`: 全員の全予定（`pnpm calendar:export`）。LifeHub が使えなくなったときに他のカレンダーアプリへ取り込む用。タスクは含まない。

ダンプを戻すには、Postgres 17 以上のクライアント（`pg_dump` / `psql`。本番の Neon と同じ版以上が要る）を入れて次を実行する。ダンプに含まれるテーブルは中身ごと置き換わり、途中で失敗したら何も変わらない。

```sh
# 本番データのクローンを手元に作る（.env.local の DATABASE_URL に戻す）
pnpm db:restore lifehub.sql

# 本番から直接ダンプを取る（接続文字列は terraform output -raw database_url）
DATABASE_URL='postgresql://...' pnpm db:dump lifehub.sql
```

戻した DB では本番のパスワードでログインできる。セッションは `BETTER_AUTH_SECRET` が違うので引き継がれない。


| 環境 | ブランチ | DB | 用途 |
|---|---|---|---|
| `production` | main | Neon `main` ブランチ | 本番 https://lifehub.crat.jp |
| `preview` | PR | PR ごとに作る Neon ブランチ（`preview/pr-<番号>`） | `preview` ラベルを付けた PR の Vercel Preview URL |
| `local` | — | Neon `dev` ブランチ または Docker の Postgres | `pnpm dev` |

環境変数の一覧は [.env.example](.env.example)。
