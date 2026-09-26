---
name: creating-new-feature
description: LifeHub に新しい機能（feature）を追加するときの手順。要件 → Zod スキーマ → サーバー feature → クライアント feature → テスト → ドキュメントの順に、既存機能と同じ構造で作る。
---

# 機能追加の手順

新機能は「feature ディレクトリを（クライアントとサーバーに）作り、ルートと MCP に 1 行ずつ足す」で完了する。既存機能（例: `lemon`, `expenses`）をひな形にし、同じ構造・同じパターンで作る。設計の前提は [docs/architecture.md](../../../docs/architecture.md)、データ規約は [docs/data-model.md](../../../docs/data-model.md)。

## チェックリスト

1. **要件を書く**: `docs/features/<name>.md` に目的・画面・データ・API・MCP ツール・通知・ホームでの出し方を 1 ページで書く。
2. **Zod スキーマ**: `shared/validation/<name>.ts` に入力スキーマを書く。クライアントのフォームと API で同じスキーマを使う。MCP ツールは API の写しにせず LLM が呼びやすい形に作り、項目の定義がそのまま分かりやすいときだけこのスキーマを共有する（`docs/architecture.md` の「レイヤー構成」）。
3. **サーバー feature** `server/features/<name>/` を作る:
   - `schema.ts`（Drizzle テーブル。共通規約: uuid v7 主キー、`created_at` / `updated_at` / `created_by`、timestamptz）
   - `server/lib/db/schema.ts` に `export * from '../../features/<name>/schema.ts'` を追加
   - `pnpm db:generate` でマイグレーションを生成し、`drizzle/` をコミットする
4. **`repository.ts` → `service.ts` → `routes.ts`** の順に実装する。
   - repository は Drizzle クエリのみ。service に業務ロジック。routes は `validate(target, schema)`（`server/lib/validator.ts`）で検証して service を呼ぶだけ。`/:id` のパラメータは `shared/validation/common.ts` の `idParamSchema` を使う。
   - `server/app.ts` の `.route('/<name>', <name>Routes)` チェーンに追加する（型が Hono RPC クライアントへ伝わる）。
5. **MCP に登録する**: `mcp.ts` → `server/mcp.ts`。通知を出す機能なら `server/features/events/notifications.ts` と同じ形（列挙と再検証）を作り、`server/features/notifications/service.ts` から呼ぶ。
6. **クライアント feature** `src/features/<name>/` を作る:
   - `queries.ts`（`queryOptions` と mutation。`src/lib/api.ts` の Hono RPC クライアント経由。書き込みは `useOptimisticMutation`（`src/lib/query-client.ts`）で行い、`apply` に「サーバーが返すはずの値」だけを書く。取得の中断・失敗時の巻き戻し・通知・invalidate は共通）
   - `components/`（表示に専念。状態とロジックは queries / service / `use-*.ts` のフックに置く。記録 1 件の追加・閲覧・編集は `RecordSheet`（スマホはボトムシート、PC はダイアログ。閉じる・保存ボタンとエラー表示を持つ）+ `useFormSubmit`（`src/lib/form.ts` の `formText` / `formSelect` / `formList` で FormData を読み、返す `sheet` を `RecordSheet` にそのまま広げる。既にある記録の詳細は `sheet` を `useRecordDetail` に渡し、閲覧と編集の切り替え・削除まで含んだ `sheet` を広げる）で作り、呼び出し側が条件付きでマウントする。参加者の選択は `ParticipantsField`、繰り返しは `RecurrenceFields`。右下の追加ボタンは `AddMenu`（種類と受ける画面を `src/lib/add-pages.ts` の `ADD_PAGES` に、名前とアイコンを `src/features/add/kinds.ts` に足し、フォームを `AddForm` に足す。追加のフォームは保存先の mutation を自分で持つ）か `FAB_SX`（`src/lib/ui/layout.ts`））
   - `src/routes/_authenticated/<name>.tsx` にページを追加し、`src/navigation.ts` に登録する。ページタイトルは出さない。ページ固有の操作は `AppBarContent` で AppBar に差し込む
   - 記録を持つ機能は、ホームのタイムライン（[docs/features/home.md](../../../docs/features/home.md)）に並べる: `shared/timeline.ts` に行の形と日時の規則を足し、service に `timelineSource`（`server/lib/timeline-source.ts` の `TimelineSource`。1 件が 1 つの日時に置かれる記録なら repository で `server/lib/db/history.ts` の `timelineQueries` から作れる）を足して `server/features/timeline/service.ts` の `sources` に並べる。書き込みの `keys` に `TIMELINE_QUERY_KEY` を入れ（1 件が 1 行の記録は `src/features/timeline/queries.ts` の `timelineRecordCache` で履歴とタイムラインへ先回りして書く）、行の詳細を `TimelineEntrySheet` に足す
   - ホームの状態のタイルは `src/features/dashboard/components/StatusCards.tsx` に足す（自分の機能のクエリを読む）
   - ルートに loader は置かない（移動をデータで待たせない）。ページもタイルも自分でクエリを読み、`QueryView`（`src/lib/ui/QueryView.tsx`）で包んで読み込み中の骨組みと取得失敗の表示をまかせる
7. **テスト**: service のユニットテスト（`server/features/<name>/__tests__/`、実 DB）、必要なら E2E（`e2e/`）。
8. **ドキュメント更新**: `docs/features/<name>.md`、`docs/data-model.md`、`docs/features/mcp.md` のツール一覧。

## 守ること

- 計算はサーバーだけで行い、クライアントで再実装しない。
- サーバーの層の向き（routes / mcp → service → repository → DB、他の feature は service 経由）は biome が強制する。lint に止められたら、規則を緩めずに呼び出しを service へ寄せる。
- 書かなくて済むものは書かない。Web 標準 → React/Hono/MUI の標準 → 実績あるライブラリ → 自作の順。
- import は相対パスで `.ts` / `.tsx` 拡張子付き。パスエイリアスは使わない。
- `pnpm typecheck && pnpm lint && pnpm test` を通してからコミットする。コミットメッセージは Conventional Commits で WHY / WHY NOT を書く。
