# データモデル

Drizzle のスキーマ（`server/features/*/schema.ts`、`server/lib/db/schema.ts` で集約）が単一情報源。本書は表の一覧と、どの表にも共通する規約を書く。列ごとの意味と、値から画面に出すものを導く計算は各機能の文書（[features/](features/)）に書く。マイグレーション SQL は `drizzle/` にコミットする。`drizzle-kit generate` の生成物が基本だが、列の作り替えで既存の行を移すときは生成された SQL に移送の文を書き足す（`0002_lemon_multi_care_types.sql`。生成物任せだと列を落として中身ごと捨てるため）。

## 共通規約（Postgres）

- 主キーは `uuid`。アプリ側で UUID v7 を生成する（`shared/id.ts`。時系列ソート可能）。better-auth 管理のテーブルも `generateId` で UUID v7 を使う。記録を追加する API（events / expenses / lemon / memos と記録投入の `/api/records`。`shared/validation/common.ts` の `clientIdShape`）では ID をクライアントが決めて送れる（省略時はサーバーが採番する）。同じ ID の作成が既にあれば何も書かない（上書きもしない）ので、オフラインで溜めた書き込みを送り直しても二重に作られず、その間の編集も巻き戻らない（[architecture.md](architecture.md#オフラインの書き込み)）。
- 日時は `timestamptz`（UTC 保存、表示時に JST 変換）。日付のみは `date`。TypeScript では JST の暦日を `DateString`（`shared/types.ts`。検証済みの文字列にだけ付く brand 型）で表し、`shared/date.ts` の変換関数と `dateStringSchema` だけが作る。
- 金額は `integer`（円）。
- 全テーブルに `created_at`, `updated_at`, `created_by`（users 参照）。`lemon_care_logs.created_by` だけは null（記録した人が不明）を許す（API キーで入れた記録。[features/api-keys.md](features/api-keys.md)）。例外は、台帳の `sent_notifications`、外部の ics を写しただけの `holidays`、気象庁の予報と観測を写しただけの `weather` と `weather_hourly` と `weather_pop`、結合テーブルの `event_participants`、`user_id` が持ち主そのものである `push_subscriptions` と `calendar_feeds` と `api_keys` と `mcp_event_subscriptions`、better-auth 管理のテーブル（それぞれの規約に従う）。
- インデックスは実際に絞り込みや結合で使う列だけに張る。行数が少なく順次走査で足りるテーブル（`expenses`, `lemon_care_logs`）には張らない。データ量は数千行の桁に留まり、この規模では順次走査が 1ms 前後で終わる一方、インデックスは書き込みのたびに更新費用がかかる。
- **読み取りは、結果に依らない問い合わせを同じ時点に投げる**。本番の Neon は HTTP ドライバで、問い合わせ 1 回が HTTP の往復 1 回になり、行数より往復の回数が応答時間を決める。同じ時点に投げた読み取りは 1 往復にまとめて送られる（[architecture.md](architecture.md#通信の往復)）ので、互いに依らない問い合わせは `Promise.all` で並べ、`await` で 1 つずつ待たない。1 つの表の中で関連する行は結合・集約でまとめて 1 回で読む。書き込みで複数文が要るときは `runBatch`（[architecture.md](architecture.md#技術スタック)）にまとめる。
- **画面に出す値が行の集約で決まるなら、行を全部読まずに SQL で畳む**（立替の精算、レモンの項目ごとの最新）。計算式そのものは `shared/` に 1 つだけ置き、SQL は集約までを担う。
- 論理削除は使わない。
- テーブル名・列名は snake_case、TypeScript 側のキーは camelCase。

## テーブル

| テーブル | 主な列 | 備考 |
|---|---|---|
| `users` / `sessions` / `accounts` / `verifications` / OAuth 関連 | better-auth 管理 + `users.hue`, `users.all_day_notify_minutes` | `users.name` を表示名として使う。`users.hue`（integer, 0〜359, 既定 335）はユーザーの色（OKLCH の色相。[users.md](features/users.md)）。`users.all_day_notify_minutes`（integer, 0〜1439, 既定 420 = 7:00）は終日の予定・タスクを通知する時刻（[notifications.md](features/notifications.md)）。パスワードハッシュは `accounts.password`（`provider_id = 'credential'`） |
| `push_subscriptions` | `user_id`(index), `endpoint`(unique), `p256dh`, `auth`, `user_agent` | 端末ごとに 1 行。配信失敗（410/404）で削除 |
| `calendar_feeds` | `user_id`, `name`, `token`(unique), `last_accessed_at` | カレンダーを ics で配る URL（[features/calendar-feeds.md](features/calendar-feeds.md)）。1 ユーザーが何本でも持ち、行を消せばその URL だけが失効する。`token` はハッシュ化せず保存する（理由は calendar-feeds.md の「トークン」）。索引は `token` の一意制約だけ（配信のたびに引くのはトークンで、一覧は数本の全走査で足りる） |
| `api_keys` | `user_id`, `name`, `key_hash`(unique), `last_used_at` | 記録投入用エンドポイント（`POST /api/records`）を呼ぶ API キー（[features/api-keys.md](features/api-keys.md)）。1 ユーザーが何本でも持ち、行を消せばそのキーだけが失効する。キーそのものは保存せず、SHA-256 を base64url にしたものだけを置く（理由は api-keys.md の「キー」）。索引は `key_hash` の一意制約だけ |
| `calendar_feed_participants` | `feed_id`, `user_id` | 配信 URL に載せる参加者。この中の誰かが入っている予定だけを配る。PK(`feed_id`, `user_id`)。1 人以上は Zod で守る（結合テーブルでは DB 制約にできない）。列（配列）ではなく行で持つのは、消えたユーザーの ID が残らないようにするため |
| `events` | `kind` (`event` / `task`), `title`, `all_day`, `starts_at`, `ends_at`, `completed_at`, `location`, `note`, `remind_start_minutes`, `remind_end_minutes`, `rrule` (null=単発), `series_id`, `occurrence_start`, `cancelled` | 予定とタスクを 1 つにしたイベント（[features/events.md](features/events.md)）。予定は `starts_at`/`ends_at` 必須、タスクは任意で `ends_at` が期限、`completed_at` はタスクのみ（いずれも CHECK）。終日（予定・タスクとも）は `all_day=true` かつ `starts_at`=JST 0:00、`ends_at`=翌日 JST 0:00（終端は排他的）。通知の分は 0 / 5 / 10 / 15 / 30 / 60 / 120 / 1440、null は通知なし（終日は 0 / 1440 だけ。CHECK）。`rrule` を持つ行が繰り返し元（DTSTART は `starts_at`、無ければ `ends_at`）。`series_id`（繰り返し元を参照、ON DELETE CASCADE）と `occurrence_start`（元の発生の基準日時）を持つ行は繰り返しの回を実体化したもの（全項目の複製）で、`rrule` は持たない。`cancelled` はその回の取り消し。unique(`series_id`, `occurrence_start`)（`series_id` だけの検索も先頭列で足りるので単独のインデックスは置かない）。これらの整合は CHECK 制約で守る（`(series_id IS NULL) = (occurrence_start IS NULL)` 等） |
| `event_participants` | `event_id`, `user_id` | 参加者。PK(`event_id`, `user_id`)。1 人以上は Zod で守る（結合テーブルでは DB 制約にできない） |
| `expenses` | `from_user_id`(user, null=共有), `to_user_id`(user, null=共有), `amount`, `description`, `spent_on` | 立替（ユーザーと共有口座の間の貸し借り）。from が to のために払った。精算も同じ行（from = 払った人、to = 受け取った人）。規則は [expenses.md](features/expenses.md) |
| `lemon_care_logs` | `care_types` (`mist` 葉水 / `water` 水やり / `fertilize` 施肥 / `bloom` 開花 / `drop` 落果 / `harvest` 収穫 の配列), `done_at`, `note` | 世話の記録（[features/lemon.md](features/lemon.md#データ)）。空の配列は項目に結び付かない記録＝メモで、本文必須。綴りと「空なら本文必須」は CHECK 制約でも守る。`created_by` は API キーで入れた記録では null で、代わりに `api_key_name` にそのキーの名前を持つ（どちらか一方だけ。CHECK 制約） |
| `memos` | `body`, `pinned`, `created_by`, `mcp_client_name`, `created_at` | メモ（[features/memos.md](features/memos.md)）。500 文字までのプレーンテキスト（Zod で守る）。日時は書いた時刻（`created_at`）だけで、編集しても動かない。ホームのタイムラインにだけ出る。`pinned` はホームの一番上に固定するか（[features/memos.md](features/memos.md#ピン止め)） |
| `holidays` | `date`(PK) | 日本の祝日・休日（[features/holidays.md](features/holidays.md)）。外部の ics を月次 Cron で取り直し、全行を入れ替える。使うのは日付だけなので名前は持たない |
| `weather` | `date`(PK), `code`, `temp_max`, `temp_min`, `pop` | 日ごとの天気・最高／最低気温・降水確率（東京。[features/weather.md](features/weather.md#日ごとの天気weather)）。気象庁の予報を 1 日 3 回の Cron で取り直し、予報のある日を上書きする。過去の日は消さない。終わった日の最高・最低気温は毎朝の Cron でアメダスの観測値に上書きする。気温と降水確率は予報に無い日があるので null を許し、null では上書きしない。アイコンの種類と名前は読むときに天気コードから引く |
| `weather_hourly` | `starts_at`(PK), `weather`, `temp` | 3 時間ごとの天気（東京地方。[features/weather.md](features/weather.md#3-時間ごとの天気と気温weather_hourly)）。気象庁の天気分布予報を 1 日 3 回の Cron で取り直し、予報のある区間を上書きする。過ぎた区間は消さない。天気は気象庁の名前（「くもり」など）のまま持ち、アイコンの種類は読むときに引く。気温は区間の始まりの時刻の東京の予想気温で、載っていない報もあるので null を許し、null では上書きしない |
| `weather_pop` | `starts_at`(PK), `pop` | 6 時間ごとの降水確率（東京地方。[features/weather.md](features/weather.md)）。気象庁の予報の短期予報の降水確率を 1 日 3 回の Cron で取り直し、予報のある区間を上書きする。過ぎた区間は消さない |
| `mcp_event_subscriptions` | `id`(PK。`sub_` + 人・URL・イベント名の SHA-256), `user_id`, `name`(index), `url`, `secret`, `previous_secret`, `previous_secret_expires_at`, `expires_at` | MCP Events の購読（[features/mcp-events.md](features/mcp-events.md)）。購読し直すと同じ行を更新する。`user_id` が持ち主そのもの（作成者を別に持たない）。期限を過ぎた行は次の購読のときに消す |
| `sent_notifications` | `key`(PK), `sent_at` | 送信済み通知の台帳（QStash の再送時の重複防止）。古い行は日次 Cron で削除 |
