# カレンダー／イベント（calendar）

## 目的

予定（events）とタスク（tasks）を 1 つの時系列に統合して見せる**読み取り専用**の feature。書き込みは events / tasks の各 API に送る。

## 画面

| 画面 | パス | 内容 |
|---|---|---|
| カレンダー | `/calendar` | 予定とタスクを月／週のグリッドで閲覧・追加・編集・削除。初期表示は今月（月表示）。 |
| イベント | `/events` | 同じデータを時系列リストとして高機能に扱う。期間指定・種別（予定／タスク）・所有者フィルタ・完了状態・キーワード検索・過去の記録の振り返り。初期表示は「今日から前後 7 日」。 |

- 月／週グリッドは MUI 部品で自作（`src/features/calendar/components/`）。汎用カレンダーライブラリは使わない。
- 週の始まりは月曜。
- どちらの画面も `CalendarItem[]` だけを読む。予定とタスクの差はカードの描画と操作（完了ボタンの有無）にのみ現れる。

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

- 右下の追加ボタン（SpeedDial）から予定・タスクのどちらも追加できる。
- 項目の詳細ダイアログは種別ごと（`EventDetailDialog` / `TaskDetailDialog`）。タスクはカードのチェックボックスからも完了できる。

## MCP ツール

`calendar_list_items`（[mcp.md](mcp.md)）。
