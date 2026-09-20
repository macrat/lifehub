---
name: creating-new-feature
description: LifeHub に新しい機能（feature）を追加するときの手順。要件 → Zod スキーマ → サーバー feature → クライアント feature → テスト → ドキュメントの順に、既存機能と同じ構造で作る。
---

# 機能追加の手順

新機能は「feature ディレクトリを（クライアントとサーバーに）作り、registry に 1 行ずつ足す」で完了する。既存機能（例: `tasks`, `expenses`）をひな形にし、同じ構造・同じパターンで作る。設計の前提は [docs/architecture.md](../../../docs/architecture.md)、データ規約は [docs/data-model.md](../../../docs/data-model.md)。

## チェックリスト

1. **要件を書く**: `docs/features/<name>.md` に目的・画面・データ・API・MCP ツール・通知・ホームのカードを 1 ページで書く。
2. **Zod スキーマ**: `shared/validation/<name>.ts` に入力スキーマを書く。クライアントのフォーム・API・MCP ツールで同じスキーマを使う。
3. **サーバー feature** `server/features/<name>/` を作る:
   - `schema.ts`（Drizzle テーブル。共通規約: uuid v7 主キー、`created_at` / `updated_at` / `created_by`、timestamptz）
   - `server/lib/schema.ts` に `export * from '../features/<name>/schema.ts'` を追加
   - `pnpm db:generate` でマイグレーションを生成し、`drizzle/` をコミットする
4. **`repository.ts` → `service.ts` → `routes.ts`** の順に実装する。
   - repository は Drizzle クエリのみ。service に業務ロジック。routes は `zValidator` で検証して service を呼ぶだけ。
   - `server/app.ts` の `.route('/<name>', <name>Routes)` チェーンに追加する（型が Hono RPC クライアントへ伝わる）。
5. **横断機能に登録する**（必要なものだけ）:
   - `dashboard.ts` → `server/lib/dashboard/registry.ts`
   - `notifications.ts` → `server/lib/notifications/registry.ts`
   - `mcp.ts` → `server/lib/mcp/server.ts`
6. **クライアント feature** `src/features/<name>/` を作る:
   - `queries.ts`（`queryOptions` と mutation。`src/lib/api.ts` の Hono RPC クライアント経由。成功後に `useInvalidate`（`src/lib/query-client.ts`）で関連クエリと `DASHBOARD_QUERY_KEY` を invalidate）
   - `components/`（表示に専念。状態とロジックは queries / service / `use-*.ts` のフックに置く。入力フォームは `FormDialog` + `useFormSubmit`（`src/lib/form.ts` の `formText` / `formSelect` で FormData を読む）で作り、呼び出し側が条件付きでマウントする。所有者の選択は `OwnerSelect`、繰り返しは `RecurrenceFields`。右下の追加ボタンは `FAB_SX`）
   - `src/routes/_authenticated/<name>.tsx` にページを追加し、`src/lib/ui/navigation.ts` に登録する。ページタイトルは出さない。ページ固有の操作は `AppBarContent` で AppBar に差し込む
   - ホームのカードは `src/features/dashboard/cards/` に追加し、`cards/index.tsx` の `renderCard` に 1 行足す
7. **テスト**: service のユニットテスト（`server/features/<name>/__tests__/`、実 DB）、必要なら E2E（`e2e/`）。
8. **ドキュメント更新**: `docs/features/<name>.md`、`docs/data-model.md`、`docs/features/mcp.md` のツール一覧。

## 守ること

- 計算はサーバーだけで行い、クライアントで再実装しない。
- 書かなくて済むものは書かない。Web 標準 → React/Hono/MUI の標準 → 実績あるライブラリ → 自作の順。
- import は相対パスで `.ts` / `.tsx` 拡張子付き。パスエイリアスは使わない。
- `pnpm typecheck && pnpm lint && pnpm test` を通してからコミットする。コミットメッセージは Conventional Commits で WHY / WHY NOT を書く。
