# データモデル

Drizzle のスキーマ（`server/features/*/schema.ts`、`server/lib/schema.ts` で集約）が単一情報源。本書はその意図と計算ルールを説明する。マイグレーション SQL は `drizzle/` に生成物としてコミットする。

## 共通規約（Postgres）

- 主キーは `uuid`。アプリ側で UUID v7 を生成する（時系列ソート可能）。better-auth 管理のテーブルも `generateId` で UUID v7 を使う。
- 日時は `timestamptz`（UTC 保存、表示時に JST 変換）。日付のみは `date`。
- 金額は `integer`（円）。
- 全テーブルに `created_at`, `updated_at`, `created_by`（users 参照）。better-auth 管理のテーブルは better-auth の規約に従う。
- 論理削除は使わない。
- テーブル名・列名は snake_case、TypeScript 側のキーは camelCase。

## テーブル

| テーブル | 主な列 | 備考 |
|---|---|---|
| `users` / `sessions` / `accounts` / `verifications` / OAuth 関連 | better-auth 管理 | `users.name` を表示名として使う（「自分／相手」の表示に用いる）。パスワードハッシュは `accounts.password`（`provider_id = 'credential'`） |
| `push_subscriptions` | `user_id`, `endpoint`(unique), `p256dh`, `auth`, `user_agent` | 端末ごとに 1 行。配信失敗（410/404）で削除 |
| `events` | `title`, `starts_at`, `ends_at`, `all_day`, `owner_user_id` (null=共有), `location`, `note`, `rrule` (null=単発), `remind_before_minutes` (null=通知なし) | 予定。終日は `all_day=true` かつ `starts_at`=JST 0:00、`ends_at`=翌日 JST 0:00（終端は排他的）。`remind_before_minutes` の選択肢は 0 / 5 / 10 / 15 / 30 / 60 / 120 / 1440、既定は null |
| `event_overrides` | `event_id`, `occurrence_start`(元の開始日時), `cancelled`, `starts_at`, `ends_at`, `title`, `note` | 繰り返し予定の個別変更・削除（RFC 5545 の RECURRENCE-ID 相当）。unique(`event_id`, `occurrence_start`) |
| `tasks` | `title`, `note`, `assignee_user_id` (null=共有), `starts_at`, `due_at`, `rrule`, `notify_at_start`, `notify_at_due` | タスク。`starts_at`/`due_at` はいずれも任意。`rrule` を持つ場合は `starts_at` または `due_at` の少なくとも一方が必須（DTSTART になる）。繰り返しでは両方の日時が発生ごとに同じ間隔でずれる |
| `task_overrides` | `task_id`, `occurrence_key`, `cancelled`, `title`, `note`, `starts_at`, `due_at` | 繰り返しタスクの特定の回だけの変更・取り消し（`event_overrides` と同じ仕組み）。unique(`task_id`, `occurrence_key`) |
| `task_completions` | `task_id`, `occurrence_key`, `completed_at`, `completed_by` | `occurrence_key` は単発なら `'single'`、繰り返しなら発生の基準日時の ISO 8601（UTC）。unique(`task_id`, `occurrence_key`) |
| `expenses` | `paid_by`(user), `amount`, `description`, `spent_on` | 立替。常に折半 |
| `settlements` | `from_user`, `to_user`, `amount`, `settled_on` | 精算 |
| `lemon_care_logs` | `care_type` (`water` 水やり / `mist` 葉水 / `fertilize` 施肥 / `bloom` 開花 / `harvest` 収穫 / `note` メモ), `done_at`, `note` | `note` 種別は本文必須。他の種別は本文任意。植物を増やす場合は `plants` テーブルと `plant_id` を追加して拡張する |
| `sent_notifications` | `key`(PK), `sent_at` | 送信済み通知の台帳（QStash の再送時の重複防止）。古い行は日次 Cron で削除 |

## 計算ルール

- **立替残高**（A が B に対して持つ債権）= (ΣA 立替 − ΣB 立替) / 2 − ΣA→B 精算 + ΣB→A 精算。端数は切り捨て。
- **繰り返しの展開**は `server/lib/recurrence` で行い、DB には発生行を作らない（マスター + 例外／完了 で表現する）。展開は要求された期間内に限り、RRULE の `UNTIL`/`COUNT` を尊重する。RRULE は `Asia/Tokyo` の壁時計で評価する（DST なし）。
- **繰り返しタスクの表示対象**（最大 2 つ）と放棄の判定は [features/tasks.md](features/tasks.md) の規則で `calendar` service が算出する。展開は「未完了の発生を基準日時順に走査し、2 つ見つかるか、2 つ後の発生が今日以前になった時点で打ち切る」。
- **タスクの `placementDate`** は保存せず、`calendar` service が毎回算出する（「今日」に依存するため保存すると陳腐化する）。
- **繰り返し予定・タスクの編集**は「この回だけ」「これ以降すべて」「すべて」の 3 択。「この回だけ」は `event_overrides` / `task_overrides`、「これ以降すべて」は元の `rrule` に `UNTIL` を付けて新しいマスターを作る、「すべて」はマスターを更新する。「これ以降すべて」の 2 文は `db.batch()` で原子的に実行する（ローカルの node-postgres では順次実行になる）。
