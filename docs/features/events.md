# 予定（events）

## 目的

2 人の予定を管理する。誰の予定か（自分／相手／共有）を区別し、繰り返し設定と開始前のプッシュ通知に対応する。過去の予定も記録として保持する。

## 画面

- カレンダー `/calendar` と イベント `/events` に、タスクと並べて表示する（[calendar.md](calendar.md)）。
- 予定のフォームは `src/features/events/components/EventForm.tsx`。ホームのクイック追加・カレンダー・イベント画面で同じフォームを使う。
- 入力項目: タイトル、終日、開始日時、終了日時、所有者（自分／相手／共有）、場所、メモ、繰り返し（なし／毎日／毎週／毎月／毎年、UNTIL）、リマインド（なし／0/5/10/15/30/60/120/1440 分前）。
- 繰り返し予定の編集・削除は「この回だけ」「これ以降すべて」「すべて」の 3 択。

## データ

`events`, `event_overrides`（[data-model.md](../data-model.md)）。

- 終日は `all_day=true` かつ `starts_at`=JST 0:00、`ends_at`=翌日 JST 0:00（終端は排他的）。
- 繰り返しは RRULE 文字列（`rrule` 列）。DTSTART は `starts_at`。展開は `server/lib/recurrence`。
- 「この回だけ」の変更・削除は `event_overrides`（`occurrence_start` = 元の開始日時）。
- 「これ以降すべて」は元の `rrule` に `UNTIL`（対象回の直前）を付け、対象回以降を新しいマスターとして作る。

## API（`server/features/events/routes.ts`）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/events?from&to` | 期間内の発生（展開済み）を返す |
| GET | `/api/events/:id` | マスターを返す |
| POST | `/api/events` | 作成 |
| PUT | `/api/events/:id` | 更新。`scope`（`all` / `this` / `following`）と `occurrenceStart` を指定 |
| DELETE | `/api/events/:id` | 削除。`scope` と `occurrenceStart` を指定 |

入力スキーマは `shared/validation/events.ts`。

## MCP ツール

`events_list`, `events_create`, `events_update`, `events_delete`（[mcp.md](mcp.md)）。

## 通知

開始の `remind_before_minutes` 前に、所有者（共有なら 2 人）の全端末へ送る。既定は通知なし。通知キーは `event:<id>:<occurrenceStart ISO>`。詳細は [notifications.md](notifications.md)。

## ホームのカード

「次の予定」: 現在時刻以降で最も近い予定を最大 5 件（自分・相手・共有すべて）。`server/features/events/dashboard.ts`。
