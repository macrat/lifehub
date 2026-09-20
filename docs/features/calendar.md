# カレンダー（calendar）

## 目的

予定（events）とタスク（tasks）を 1 つの時系列に統合して見せる**読み取り専用**の feature。書き込みは events / tasks の各 API に送る。

## 画面

| 画面 | パス | 内容 |
|---|---|---|
| カレンダー | `/calendar?view=month\|week\|day\|list&date=YYYY-MM-DD` | 予定とタスクを 1 つの画面で、月（グリッド）・週／日（タイムライン）・リストの 4 通りに表示し、追加・編集・削除する。初期表示は今月の月表示。 |

表示は AppBar 右端のメニューで切り替える。すべて `CalendarItem[]` だけを読み、予定とタスクの差は描画と操作（完了の有無）にのみ現れる。部品は MUI で自作（`src/features/calendar/components/`）し、汎用カレンダーライブラリは使わない。週の始まりは月曜。

- **月**（`MonthGrid`）: Google カレンダー流のレーン配置。週ごとに、複数日・終日の予定を「開始列と長さ」の順に 1 本のバー（開始日・終了日だけ角丸）として先に置き、残りの日ごとの項目（時刻付き予定は「● タイトル」、タスクはチェック印付き）を空いたレーンに詰める（`lane-layout.ts`）。行の高さに入りきらないレーンは「+n」。グリッドは画面の残り全部を占め、レーン数は行の高さから実測する。日をタップするとその日の日表示へ移る（スマホでは項目はタップできず、セルのどこを押しても日を選ぶ。PC では項目をクリックすると詳細）。
- **週・日**（`TimelineView` + `TimeGrid`）: Google カレンダーと同じタイムライン。上に日付の見出しと終日欄（終日・複数日の予定、時刻の無いタスク。月と同じレーン配置）、下に 0〜24 時の時間軸（`TimeGrid`。縦にスクロールする部分）。時間指定の予定は開始〜終了の高さの塗りブロック、時刻付き（期限 → 開始の優先）のタスクはその時刻に薄い背景の小さなブロック。同じ時間帯に重なる項目は横に並べる（`timeline-layout.ts`: 重なり合う集まりごとに列を割り当て、幅を等分）。今日の列には現在時刻の赤い線。初期スクロールは今日なら現在時刻の少し上、それ以外は 7 時。週表示で日付の見出しをタップすると日表示へ。
- **リスト**（`ListView`）: 時系列の一覧（Google カレンダーの「スケジュール」）。AppBar に検索、絞り込みボタンで期間・種別（予定／タスク）・誰の・完了状態を開く。既定の期間は「表示中の日の前 7 日〜後 21 日」。
- **状態**: 表示・日付・絞り込みはすべて検索パラメータ（`use-calendar-page.ts` がそこから取得範囲・見出し・前後の移動を導き、ページは描画だけ）。
- **移動**: AppBar の年月（週なら期間、日なら日付）をタップすると年月の選択ダイアログ（`MonthPickerDialog`）。スマホでは月・週・日の表示を左右にスワイプすると前後の月・週・日へ（`use-swipe.ts`。横の移動が縦の 2 倍を超えたときだけ反応し、縦スクロールと混ざらない）。前後ボタンは置かない。「今日」ボタンで今日へ。
- **色**: 項目の色は所有者・担当者のユーザーの色（[users.md](users.md)）。共有はアプリ既定の色相。
- API 上は複数日の予定が日ごとに 1 件（`dayIndex` / `dayCount`）で返るので、グリッドとタイムラインの終日欄はそれをバーに束ねる。リスト（`DayList`）では日ごとの行のまま表示する。

## CalendarItem

```ts
type CalendarItem =
  | { kind: 'event'; id: string; occurrenceStart: string; placementDate: string; title: string; startsAt: string; endsAt: string; allDay: boolean; ownerUserId: string | null; location: string | null; note: string | null; isRecurring: boolean; ... }
  | { kind: 'task';  id: string; occurrenceKey: string;  placementDate: string; title: string; startsAt: string | null; dueAt: string | null; assigneeUserId: string | null; note: string | null; completedAt: string | null; isOverdue: boolean; isRecurring: boolean; ... }
```

`placementDate` は JST の `YYYY-MM-DD`。予定は開始日（複数日にまたがる予定は日ごとに 1 件）、タスクは [tasks.md](tasks.md) の表示規則で決める。

## API（`server/features/calendar/routes.ts`）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/calendar/items?from&to` | `from`〜`to`（JST 日付、両端含む）の `CalendarItem[]`。`placementDate` 昇順、同日内は終日 → 時刻順 |

`server/features/calendar/service.ts` が events / tasks の service を呼び、予定に `placementDate`（複数日は日ごと）を付与し、タスク（tasks service が表示規則を適用済み）と統合する。クライアントで再計算しない。同日内の順序は「終日の予定 → 時刻のある項目（予定の開始、タスクの開始または期限）→ 時刻の無いタスク」。

- 右下の追加ボタン（SpeedDial）から予定・タスクのどちらも追加できる。初期日付は表示中の日。
- 項目の詳細ダイアログは種別ごと（`EventDetailDialog` / `TaskDetailDialog`）。リストとホームでは行のチェックボックスからも完了できる。
- カレンダーの取得（`calendarItemsQueryOptions`）は `staleTime: 0`。永続化キャッシュの書き込みは 1 秒遅れるため、変更直後に再読み込みすると古い一覧が復元されることがあり、表示のたびに取り直す（キャッシュはまず出す）。

## ホームのカード

「今日」: 今日の予定と未完了のタスクを 1 つの一覧にする（`server/features/calendar/dashboard.ts`）。1 項目 1 行で、印（予定は色の点、タスクはチェックボックス）・時刻・タイトルだけを出し、名前や終了時刻は出さない。明日以降は出さない。見出しから日表示へ。

## MCP ツール

`calendar_list_items`（[mcp.md](mcp.md)）。
