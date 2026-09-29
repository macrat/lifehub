# LifeHub

家庭で使うあらゆるツールを 1 つにまとめた Web アプリ。予定・タスク・立替精算・レモンの木の世話記録・メモ・天気を、スマホ（PWA）・PC・AI ツール（MCP）から扱う。

- 公開 URL: https://lifehub.crat.jp
- 利用者は 2 人。全員が管理者。言語は日本語、タイムゾーンは `Asia/Tokyo` 固定。
- ドキュメントは [docs/](docs/README.md)（どの文書に何が書いてあるかの一覧）。
- レモンの世話を記録するボタン（M5Stack AtomS3R）のファームウェアは [iot/lemon-record-button/](iot/lemon-record-button/README.md)。
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
pnpm data:refresh                 # 祝日と天気を取ってくる
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
| `pnpm db:dump <file>` / `pnpm db:restore <file>` | `DATABASE_URL` の DB をまるごと SQL に書き出す／書き出した SQL を戻す（`pg_dump` / `psql` を使う。[docs/operations.md](docs/operations.md#バックアップ)） |
| `pnpm user:create` | 初期ユーザー作成（`--email` `--name` `--password`） |
| `pnpm calendar:export <file>` | `DATABASE_URL` の DB にある全員の全予定を ics に書き出す |
| `pnpm db:seed` | ローカル用のサンプルデータ投入（全テーブルを空にしてから。本番では実行できない）。最後に `pnpm data:refresh` も走る |
| `pnpm data:refresh` | `DATABASE_URL` の DB に祝日と天気を配布元から取り直して入れる（デプロイでも実行する。カレンダーは表を読むだけで取りに行かないため） |
| `pnpm vapid:generate` | VAPID 鍵ペア生成 |
| `pnpm icons:generate` | `public/icons/` の SVG と MUI のアイコンから PWA アイコン（アプリ・通知・ショートカット）の PNG を生成 |
| `pnpm tf:plan` / `pnpm tf:apply` | `infra/` の Terraform（ローカルから手動で実行する場合。通常は CI に任せる） |
