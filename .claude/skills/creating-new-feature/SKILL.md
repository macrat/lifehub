---
name: creating-new-feature
description: LifeHub に新しい機能（feature）を追加するときの手順。要件 → Zod スキーマ → サーバー feature → クライアント feature → テスト → ドキュメントの順に、既存機能と同じ構造で作る。
---

# 機能追加の手順

新機能は feature ディレクトリを（クライアントとサーバーに）作り、それを共通の登録先（DB スキーマ・`appRouter`・MCP・ナビゲーション、記録を持つならタイムライン・追加の入口）に 1 行ずつ足して組み込む。登録先は下のチェックリストに並べてある。既存機能（例: `lemon`, `memos`）をひな形にし、同じ構造・同じパターンで作る。設計の前提は [docs/architecture.md](../../../docs/architecture.md)、データ規約は [docs/data-model.md](../../../docs/data-model.md)。

## チェックリスト

1. **要件を書く**: `docs/features/<name>.md` を [docs/README.md](../../../docs/README.md) の見出しの順（目的・画面・固有の規則・データ・API・MCP ツール・通知・ホーム）で 1 ページに書く。複数の機能に共通する約束事は機能の文書に書かず、docs/README.md の表に従って共通の文書へ書く。
2. **Zod スキーマ**: `shared/validation/<name>.ts` に入力スキーマを書く。クライアントのフォームと手続きの入力で同じスキーマを使う。作成の入力はクライアントが ID を決められるよう `create<Name>RequestSchema = schema.safeExtend(clientIdShape)` にする（オフラインの再送で二重に作らない）。履歴のある機能は絞り込みの `<name>FilterSchema` と、それに `.extend(cursorShape)` した 1 ページの問い合わせを置く（`shared/validation/common.ts`）。MCP ツールは API の写しにせず LLM が呼びやすい形に作り、項目の定義がそのまま分かりやすいときだけこのスキーマを共有する（`docs/architecture.md` の「レイヤー構成」）。
3. **サーバー feature** `server/features/<name>/` を作る:
   - `schema.ts`（Drizzle テーブル。共通規約: uuid v7 主キー、`created_at` / `updated_at` / `created_by`、timestamptz）
   - `server/lib/db/schema.ts` に `export * from '../../features/<name>/schema.ts'` を追加
   - `pnpm db:generate` でマイグレーションを生成し、`drizzle/` をコミットする
4. **`repository.ts` → `service.ts` → `routes.ts`** の順に実装する。
   - repository は Drizzle クエリのみ（キーワードの部分一致・作成の冪等な insert（`insertOnce`）・id での更新・削除（`updateById` / `deleteById`）・参加者の書き込みは `server/lib/db/query.ts` の部品を使う）。service に業務ロジック。routes は `server/lib/trpc.ts` の `router` / `procedure`（ログイン中のユーザーの ID を使う手続きは `userProcedure` で、`ctx.userId` で読む）で `<name>Router` を作り、手続きごとに `.input(schema)` で検証して service を呼ぶだけ（読み出しは `.query`、書き込みは `.mutation` で値を返さない。service の業務エラーは `trpc.ts` が tRPC の失敗の種類に置き換える）。1 件への書き込みの入力は `shared/validation/common.ts` の `withId(schema)`（記録の ID と入力を 1 つにしたもの）、1 件の読み出し・削除は `idParamSchema`。
   - `server/app.ts` の `appRouter` に `<name>: <name>Router` を足す（型が `AppRouter` 経由でクライアントへ伝わる）。
5. **MCP に登録する**: `mcp.ts` → `server/mcp.ts`。通知を出す機能なら `server/features/events/notifications.ts` と同じ形（列挙と再検証）を作り、`server/features/notifications/service.ts` から呼ぶ。
6. **クライアント feature** `src/features/<name>/` を作る:
   - `queries.ts`（`queryOptions` と mutation。読み出しは `src/lib/api.ts` の `api.<name>.<手続き>.query(input, { signal })`。書き込みは `src/lib/mutation.ts` の `useOptimisticMutation`（追加は行の id をクライアントで決める `useCreateMutation`）で行い、送る内容は `request: write.<name>.<手続き>`（1 件の削除は `(id: string) => write.<name>.delete({ id })`）で渡し、`apply` に「サーバーが返すはずの値」だけを書く。取得の中断・失敗時の巻き戻し・通知・invalidate は共通）
   - `components/`（表示に専念。状態とロジックは queries / service / `use-*.ts` のフックに置く。記録 1 件の追加・閲覧・編集は `RecordSheet`（スマホはボトムシート、PC はダイアログ。閉じる・保存ボタンとエラー表示を持つ）+ `useFormSubmit`（`src/lib/form.ts` の `formText` / `formSelect` / `formList` で FormData を読み、返す `sheet` を `RecordSheet` にそのまま広げる。既にある記録の詳細は `sheet` を `useRecordDetail` に渡し、閲覧と編集の切り替え・削除まで含んだ `sheet` を広げる）で作り、呼び出し側が条件付きでマウントする。参加者の選択は `ParticipantsField`、繰り返しは `RecurrenceFields`。右下の追加ボタンは `AddFab`（`src/lib/ui/AddFab.tsx`。押すとその画面のフォームを開く）。種類を選ばせる画面だけ `AddMenu`（`src/lib/ui/AddMenu.tsx`）。種類と受ける画面は `src/lib/add-pages.ts` の `ADD_PAGES` に、名前とアイコンは `src/lib/add-kinds.ts` に足す。追加のフォームは保存先の mutation を自分で持つ）
   - `src/routes/_authenticated/<name>.tsx` にページを追加し、`src/navigation.ts` に登録する。ページタイトルは出さない。ページ固有の操作は `AppBarContent` で AppBar に差し込む
   - 記録を持つ機能は、ホームのタイムライン（[docs/features/home.md](../../../docs/features/home.md)）に並べる: `shared/timeline.ts` に行の形と日時の規則を足し、service に `timelineSource`（`server/lib/timeline-source.ts` の `TimelineSource`。1 件が 1 つの日時に置かれる記録なら repository で `server/lib/db/timeline.ts` の `timelineQueries` を作り、service で `recordTimelineSource` に渡すだけ）を足して `server/features/timeline/service.ts` の `recordSources` に並べる。書き込みの `keys` を `recordWriteKeys`（`src/features/timeline/queries.ts`）で作り（1 件が 1 行の記録は `src/features/timeline/queries.ts` の `timelineRecordCache` で履歴とタイムラインへ先回りして書く）、行の詳細を `TimelineEntrySheet` に足す
   - ホームの状態のタイルは `src/features/dashboard/components/StatusCards.tsx` に足す（自分の機能のクエリを読む）
   - ルートに loader は置かない（移動をデータで待たせない）。画面（routes）がその画面で読むクエリを `useScreenQueries` / `useScreenHistory`（`src/lib/screen-data.ts`）で 1 か所で購読し、部品は `useStoreQuery` などで store から読むだけにする（[docs/architecture.md](../../../docs/architecture.md#オフラインと起動速度)。`lint/screen-data.grit` が強制する）。部品は `QueryView`（`src/lib/ui/QueryView.tsx`）で包んで読み込み中の骨組みと取得失敗の表示をまかせる
7. **テスト**: service のユニットテスト（`server/features/<name>/__tests__/`、実 DB）、必要なら E2E（`e2e/`）。
8. **ドキュメント更新**: `docs/features/<name>.md`、`docs/data-model.md`、`docs/features/mcp.md` のツール一覧、`docs/README.md` の機能の文書の表。

## 守ること

- 計算をクライアントで再実装しない。楽観的更新で要る計算は `shared/` に置き、サーバーとクライアントが同じコードを使う（[docs/architecture.md](../../../docs/architecture.md#レイヤー構成)）。
- サーバーの層の向き（routes / mcp → service → repository → DB、他の feature は service 経由）は biome が強制する。lint に止められたら、規則を緩めずに呼び出しを service へ寄せる。
- 書かなくて済むものは書かない。Web 標準 → React/Hono/MUI の標準 → 実績あるライブラリ → 自作の順。
- import は相対パスで `.ts` / `.tsx` 拡張子付き。パスエイリアスは使わない。
- `pnpm typecheck && pnpm lint && pnpm test` を通してからコミットする。コミットメッセージは Conventional Commits で WHY / WHY NOT を書く。
