# データモデル

Drizzle のスキーマ（`server/features/*/schema.ts`、`server/lib/schema.ts` で集約）が単一情報源。本書はその意図と計算ルールを説明する。マイグレーション SQL は `drizzle/` に生成物としてコミットする。

## 共通規約（Postgres）

- 主キーは `uuid`。アプリ側で UUID v7 を生成する（時系列ソート可能）。better-auth 管理のテーブルも `generateId` で UUID v7 を使う。
- 日時は `timestamptz`（UTC 保存、表示時に JST 変換）。日付のみは `date`。
- 金額は `integer`（円）。
- 全テーブルに `created_at`, `updated_at`, `created_by`（users 参照）。例外は、台帳の `sent_notifications`、結合テーブルの `event_participants`、`user_id` が持ち主そのものである `push_subscriptions`、better-auth 管理のテーブル（それぞれの規約に従う）。
- インデックスは実際に絞り込みや結合で使う列だけに張る。全件を読んで並べる小さなテーブル（`expenses`, `lemon_care_logs`）には張らない。
- 論理削除は使わない。
- テーブル名・列名は snake_case、TypeScript 側のキーは camelCase。

## テーブル

| テーブル | 主な列 | 備考 |
|---|---|---|
| `users` / `sessions` / `accounts` / `verifications` / OAuth 関連 | better-auth 管理 + `users.hue` | `users.name` を表示名として使う。`users.hue`（integer, 0〜359, 既定 335）はユーザーの色（OKLCH の色相。[users.md](features/users.md)）。パスワードハッシュは `accounts.password`（`provider_id = 'credential'`） |
| `push_subscriptions` | `user_id`, `endpoint`(unique), `p256dh`, `auth`, `user_agent` | 端末ごとに 1 行。配信失敗（410/404）で削除 |
| `events` | `kind` (`event` / `task`), `title`, `all_day`, `starts_at`, `ends_at`, `completed_at`, `location`, `note`, `remind_start_minutes`, `remind_end_minutes`, `rrule` (null=単発), `series_id`, `occurrence_start`, `cancelled` | 予定とタスクを 1 つにしたイベント（[features/events.md](features/events.md)）。予定は `starts_at`/`ends_at` 必須、タスクは任意で `ends_at` が期限、`completed_at` はタスクのみ（いずれも CHECK）。終日は `all_day=true` かつ `starts_at`=JST 0:00、`ends_at`=翌日 JST 0:00（終端は排他的）。通知の分は 0 / 5 / 10 / 15 / 30 / 60 / 120 / 1440、null は通知なし。`rrule` を持つ行が繰り返し元（DTSTART は `starts_at`、無ければ `ends_at`）。`series_id`（繰り返し元を参照、ON DELETE CASCADE）と `occurrence_start`（元の発生の基準日時）を持つ行は繰り返しの回を実体化したもの（全項目の複製）で、`rrule` は持たない。`cancelled` はその回の取り消し。unique(`series_id`, `occurrence_start`)。これらの整合は CHECK 制約で守る（`(series_id IS NULL) = (occurrence_start IS NULL)` 等） |
| `event_participants` | `event_id`, `user_id` | 参加者。PK(`event_id`, `user_id`)。1 人以上は Zod で守る（結合テーブルでは DB 制約にできない） |
| `expenses` | `from_user_id`(user), `to_user_id`(user, null=共有), `amount`, `description`, `spent_on` | 立替（借方・貸方）。from が to のために払った。to が null なら折半。精算も同じ行（from = 払った人、to = 受け取った人） |
| `lemon_care_logs` | `care_type` (`water` 水やり / `mist` 葉水 / `fertilize` 施肥 / `bloom` 開花 / `harvest` 収穫 / `note` メモ), `done_at`, `note` | `note` 種別は本文必須。他の種別は本文任意。植物を増やす場合は `plants` テーブルと `plant_id` を追加して拡張する |
| `sent_notifications` | `key`(PK), `sent_at` | 送信済み通知の台帳（QStash の再送時の重複防止）。古い行は日次 Cron で削除 |

## 計算ルール

- **立替残高**（A が B に対して持つ債権）= (Σ A→共有 − Σ B→共有) / 2 + Σ A→B − Σ B→A（X→Y = X が Y のために払った額。共有は折半。精算も「払った人 → 受け取った人」の同じ形の行）。端数は切り捨て。
- **繰り返しの展開**は `server/lib/recurrence` で行い、触っていない回の行は作らない（繰り返し元 + 実体化した回 で表現する）。展開は要求された期間内に限り、RRULE の `UNTIL`/`COUNT` を尊重する。RRULE は `Asia/Tokyo` の壁時計で評価する（DST なし）。
- **繰り返しタスクの表示対象**（最大 2 つ）と放棄の判定は [features/events.md](features/events.md) の規則で `events` の `occurrences.ts` が算出し、予定と統合する。
- **タスクの `placementDate`** は保存せず、毎回算出する（「今日」に依存するため保存すると陳腐化する）。
- **繰り返しの編集**は「この回だけ」「これ以降すべて」「すべて」の 3 択。「この回だけ」はその回を実体化した行（無ければ繰り返し元の複製を作る）、「これ以降すべて」は元の `rrule` に `UNTIL` を付けて新しい繰り返し元を作る、「すべて」は繰り返し元を更新する（実体化済みの回には反映しない）。複数文は `db.batch()` で原子的に実行する（ローカルの node-postgres では順次実行になる）。
- **繰り返しタスクの完了**はその回を実体化した行の `completed_at`。単発は行自身の `completed_at`。
