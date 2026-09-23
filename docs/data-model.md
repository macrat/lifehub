# データモデル

Drizzle のスキーマ（`server/features/*/schema.ts`、`server/lib/schema.ts` で集約）が単一情報源。本書はその意図と計算ルールを説明する。マイグレーション SQL は `drizzle/` にコミットする。`drizzle-kit generate` の生成物が基本だが、列の作り替えで既存の行を移すときは生成された SQL に移送の文を書き足す（`0002_lemon_multi_care_types.sql`。生成物任せだと列を落として中身ごと捨てるため）。

## 共通規約（Postgres）

- 主キーは `uuid`。アプリ側で UUID v7 を生成する（`shared/id.ts`。時系列ソート可能）。better-auth 管理のテーブルも `generateId` で UUID v7 を使う。記録を追加する API（events / expenses / lemon）では ID をクライアントが決めて送れる（省略時はサーバーが採番する）。同じ ID の作成は upsert として扱い、オフラインで溜めた書き込みを送り直しても二重に作られない（[architecture.md](architecture.md#オフラインの書き込み)）。
- 日時は `timestamptz`（UTC 保存、表示時に JST 変換）。日付のみは `date`。TypeScript では JST の暦日を `DateString`（`shared/types.ts`。検証済みの文字列にだけ付く brand 型）で表し、`shared/date.ts` の変換関数と `dateStringSchema` だけが作る。
- 金額は `integer`（円）。
- 全テーブルに `created_at`, `updated_at`, `created_by`（users 参照）。例外は、台帳の `sent_notifications`、結合テーブルの `event_participants`、`user_id` が持ち主そのものである `push_subscriptions` と `calendar_feeds`、better-auth 管理のテーブル（それぞれの規約に従う）。
- インデックスは実際に絞り込みや結合で使う列だけに張る。全件を読んで並べる小さなテーブル（`expenses`, `lemon_care_logs`）には張らない。データ量は数千行の桁に留まり、この規模では順次走査が 1ms 前後で終わる一方、インデックスは書き込みのたびに更新費用がかかる。
- **読み取りは 1 エンドポイント 1 問い合わせを基本にする**。本番の Neon は HTTP ドライバで、問い合わせ 1 回が HTTP の往復 1 回になる。行数より往復の回数が応答時間を決めるので、関連する行は結合・集約でまとめて 1 回で読む。書き込みで複数文が要るときは `runBatch`（[architecture.md](architecture.md#技術スタック)）にまとめる。
- **画面に出す値が行の集約で決まるなら、行を全部読まずに SQL で畳む**（立替残高、レモンの項目ごとの最新）。計算式そのものは `shared/` に 1 つだけ置き、SQL は集約までを担う。
- 論理削除は使わない。
- テーブル名・列名は snake_case、TypeScript 側のキーは camelCase。

## テーブル

| テーブル | 主な列 | 備考 |
|---|---|---|
| `users` / `sessions` / `accounts` / `verifications` / OAuth 関連 | better-auth 管理 + `users.hue` | `users.name` を表示名として使う。`users.hue`（integer, 0〜359, 既定 335）はユーザーの色（OKLCH の色相。[users.md](features/users.md)）。パスワードハッシュは `accounts.password`（`provider_id = 'credential'`） |
| `push_subscriptions` | `user_id`(index), `endpoint`(unique), `p256dh`, `auth`, `user_agent` | 端末ごとに 1 行。配信失敗（410/404）で削除 |
| `calendar_feeds` | `user_id`, `name`, `token`(unique), `last_accessed_at` | カレンダーを ics で配る URL（[features/calendar-feeds.md](features/calendar-feeds.md)）。1 ユーザーが何本でも持ち、行を消せばその URL だけが失効する。`token` は 256 ビットの乱数を base64url にしたもので、ハッシュ化せず保存する（DB を読める者はカレンダーの中身も読めるので守れるものが増えず、発行時にしか URL を出せなくなる方が困る）。索引は `token` の一意制約だけ（配信のたびに引くのはトークンで、一覧は数本の全走査で足りる） |
| `calendar_feed_participants` | `feed_id`, `user_id` | 配信 URL に載せる参加者。この中の誰かが入っている予定だけを配る。PK(`feed_id`, `user_id`)。1 人以上は Zod で守る（結合テーブルでは DB 制約にできない）。列（配列）ではなく行で持つのは、消えたユーザーの ID が残らないようにするため |
| `events` | `kind` (`event` / `task`), `title`, `all_day`, `starts_at`, `ends_at`, `completed_at`, `location`, `note`, `remind_start_minutes`, `remind_end_minutes`, `rrule` (null=単発), `series_id`, `occurrence_start`, `cancelled` | 予定とタスクを 1 つにしたイベント（[features/events.md](features/events.md)）。予定は `starts_at`/`ends_at` 必須、タスクは任意で `ends_at` が期限、`completed_at` はタスクのみ（いずれも CHECK）。終日は `all_day=true` かつ `starts_at`=JST 0:00、`ends_at`=翌日 JST 0:00（終端は排他的）。通知の分は 0 / 5 / 10 / 15 / 30 / 60 / 120 / 1440、null は通知なし。`rrule` を持つ行が繰り返し元（DTSTART は `starts_at`、無ければ `ends_at`）。`series_id`（繰り返し元を参照、ON DELETE CASCADE）と `occurrence_start`（元の発生の基準日時）を持つ行は繰り返しの回を実体化したもの（全項目の複製）で、`rrule` は持たない。`cancelled` はその回の取り消し。unique(`series_id`, `occurrence_start`)（`series_id` だけの検索も先頭列で足りるので単独のインデックスは置かない）。これらの整合は CHECK 制約で守る（`(series_id IS NULL) = (occurrence_start IS NULL)` 等） |
| `event_participants` | `event_id`, `user_id` | 参加者。PK(`event_id`, `user_id`)。1 人以上は Zod で守る（結合テーブルでは DB 制約にできない） |
| `expenses` | `from_user_id`(user), `to_user_id`(user, null=共有), `amount`, `description`, `spent_on` | 立替（借方・貸方）。from が to のために払った。to が null なら折半。精算も同じ行（from = 払った人、to = 受け取った人） |
| `lemon_care_logs` | `care_types` (`mist` 葉水 / `water` 水やり / `fertilize` 施肥 / `bloom` 開花 / `drop` 落果 / `harvest` 収穫 の配列), `done_at`, `note` | 1 回の記録に項目をいくつでも結び付ける（葉水と水やりは大抵まとめてやり、その過程で開花や落果に気づく）。配列は `CARE_TYPES` の順に正規化して重複を落とす。空なら項目に結び付かない記録＝メモで、本文必須。綴りと「空なら本文必須」は CHECK 制約でも守る。植物を増やす場合は `plants` テーブルと `plant_id` を追加して拡張する |
| `sent_notifications` | `key`(PK), `sent_at` | 送信済み通知の台帳（QStash の再送時の重複防止）。古い行は日次 Cron で削除 |

## 計算ルール

- **立替残高**（A が B に対して持つ債権）= (Σ A→共有 − Σ B→共有) / 2 + Σ A→B − Σ B→A（X→Y = X が Y のために払った額。共有は折半。精算も「払った人 → 受け取った人」の同じ形の行）。端数は切り捨て。サーバーは `(from_user_id, to_user_id)` ごとの合計を SQL で出して `shared/expenses.ts` の `balanceOf` に渡す（履歴の行数に応答時間が左右されない）。クライアントも同じ合計（`GET /api/expenses/totals`）を受け取って同じ関数に渡し、楽観的更新では合計に 1 件分を足し引きする。
- **レモンの世話の状態**は項目ごとの最新の記録だけで決まる。サーバーは `care_types` を `unnest` で 1 項目 1 行にほどいてから `DISTINCT ON (care_type)` で項目ごとに 1 行だけ読み、`shared/lemon.ts` の `careStatusesOf` に渡す。
- **繰り返しの展開**は `server/lib/recurrence` で行い、触っていない回の行は作らない（繰り返し元 + 実体化した回 で表現する）。展開は要求された期間内に限り、RRULE の `UNTIL`/`COUNT` を尊重する。RRULE は `Asia/Tokyo` の壁時計で評価する（DST なし）。rrule ライブラリの走査は必ず DTSTART から始まるため、1 つのルールにつき走査は 1 回だけにし、必要な窓の外は瞬間に戻さず読み飛ばす（`expandOccurrences` の `lookbehind` / `lookahead`）。
- **繰り返しタスクの表示対象**（最大 2 つ）と放棄の判定は [features/events.md](features/events.md) の規則で `events` の `occurrences.ts` が算出し、予定と統合する。放棄されずに残る最初の回は「今以前の最後の発生の 1 つ前」なので、走査はそこから始める（それより前の回は必ず放棄済みで、完了した回は実体化された行から拾う）。
- **タスクの `placementDate`** は保存せず、毎回算出する（「今日」に依存するため保存すると陳腐化する）。
- **繰り返しの編集**は「この回だけ」「これ以降すべて」「すべて」の 3 択。「この回だけ」はその回を実体化した行（無ければ繰り返し元の複製を作る）、「これ以降すべて」は元の `rrule` に `UNTIL` を付けて新しい繰り返し元を作る、「すべて」は繰り返し元を更新する（実体化済みの回には反映しない）。複数文は `runBatch` で原子的に実行する。
- **繰り返しタスクの完了**はその回を実体化した行の `completed_at`。単発は行自身の `completed_at`。
