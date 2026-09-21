# カレンダー（calendar）

## 目的

予定とタスク（[events.md](events.md)）を 1 つの時系列に見せる画面の feature。サーバー側の feature は持たず、データの読み書きはすべて `events` の API に送る。

## 画面

| 画面 | パス | 内容 |
|---|---|---|
| カレンダー | `/calendar?view=month\|week\|day\|list&date=YYYY-MM-DD`（リスト表示の絞り込みは `from` / `to` / `kind`=`all\|event\|task` / `participant`=`all` かユーザー ID / `completed`=`all\|open\|done` / `q`） | 予定とタスクを 1 つの画面で、月（グリッド）・週／日（タイムライン）・リストの 4 通りに表示し、追加・編集・削除する。初期表示は今月の月表示。 |

表示は AppBar 右端のメニューで切り替える。すべて `CalendarItem[]` だけを読み、予定とタスクの差は描画と操作（完了の有無）にのみ現れる。部品は MUI で自作（`src/features/calendar/components/`）し、汎用カレンダーライブラリは使わない。週の始まりは月曜。

- **月**（`MonthGrid`）: Google カレンダー流のレーン配置。週ごとに、複数日・終日の予定を「開始列と長さ」の順に 1 本のバー（開始日・終了日だけ角丸）として先に置き、残りの日ごとの項目（時刻付き予定は「● タイトル」、タスクはチェック印付き）を空いたレーンに詰める（`lane-layout.ts`）。行の高さに入りきらないレーンは「+n」。グリッドは画面の残り全部を占め、レーン数は行の高さから実測する。日をタップするとその日の日表示へ移る（スマホでは項目はタップできず、セルのどこを押しても日を選ぶ。PC では項目をクリックすると詳細）。
- **週・日**（`TimelineView` + `TimeGrid`）: Google カレンダーと同じタイムライン。上に日付の見出しと終日欄（終日・複数日の予定、時刻の無いタスク。月と同じレーン配置）、下に 0〜24 時の時間軸（`TimeGrid`。縦にスクロールする部分）。時間指定の予定は開始〜終了の高さの塗りブロック、時刻付き（期限 → 開始の優先）のタスクはその時刻に薄い背景の小さなブロック。同じ時間帯に重なる項目は横に並べる（`timeline-layout.ts`: 重なり合う集まりごとに列を割り当て、幅を等分）。今日の列には現在時刻の赤い線。縦の位置を合わせるのは最初に出したときだけ（今日なら現在時刻の少し上、それ以外は 7 時）で、日付を移っても見ていた時間帯を保つ。週表示で日付の見出しをタップすると日表示へ。
- **リスト**（`ListView`）: 時系列の一覧（Google カレンダーの「スケジュール」）。AppBar に検索、絞り込みボタンで期間・種別（予定／タスク）・参加者・完了状態を開く。既定の期間は「表示中の日の前 7 日〜後 21 日」。
- **状態**: 表示・日付・絞り込みはすべて検索パラメータ（`use-calendar-page.ts` がそこから期間・見出し・前後の移動を導き、ページは描画だけ）。表示や日付の切り替え（表示の選択、日のタップ、年月の選択、今日）は履歴に積み、戻るで前の表示に戻れる。スワイプでの前後移動と絞り込みの入力は履歴を置き換える。
- **移動**: AppBar の年月（週なら期間、日なら日付）をタップすると年月の選択ダイアログ（`MonthPickerDialog`）。月・週・日の表示は左右にスワイプすると前後の月・週・日へ。前後ボタンは置かない。「今日」ボタンで今日へ。
- **スワイプ**（`SwipePager`）: 前・今・次の 3 面（`CalendarPane`）を横に並べた横スクロール + スクロールスナップ。指への追従・慣性・吸着はブラウザに任せ、吸着し終えた面（`scrollend`）が中央でなければ日付を移して中央に戻す。面ごとに自分の範囲を読むので、スワイプした先はすぐ出る。中央以外の面は `inert` + `aria-hidden`（フォーカスが入ると勝手にページが移るのと、同じ項目が読み上げや自動操作に重複して見えるのを防ぐ）。縦にスクロールする時間軸は横に動かすたびに 3 面で位置を揃える。縦スクロール・横スワイプの切り分けもブラウザのスクロールに任せる。
- **色**: 参加者が 1 人の項目はそのユーザーの色（[users.md](users.md)）。共有の項目（参加者が 1 人でない）は無彩色。
- API 上は複数日の予定が日ごとに 1 件（`dayIndex` / `dayCount`）で返るので、グリッドとタイムラインの終日欄はそれをバーに束ねる。リスト（`DayList`）では日ごとの行のまま表示する。

## CalendarItem

```ts
type Occurrence = {
  id: string;                    // 繰り返し元（単発ならその行）の id
  kind: 'event' | 'task';
  occurrenceStart: string | null; // 繰り返しの回を指す基準日時。単発は null
  title: string; allDay: boolean; startsAt: string | null; endsAt: string | null;
  completedAt: string | null; location: string | null; note: string | null;
  participantIds: string[]; rrule: string | null;
  remindStartMinutes: number | null; remindEndMinutes: number | null;
  isRecurring: boolean; isModified: boolean;
};
type CalendarItem =
  | (Occurrence & { kind: 'event'; startsAt: string; endsAt: string; placementDate: string; dayIndex: number; dayCount: number })
  | (Occurrence & { kind: 'task'; placementDate: string; isOverdue: boolean });
```

`placementDate` は JST の `YYYY-MM-DD`。予定は開始日（複数日にまたがる予定は日ごとに 1 件）、タスクは [events.md](events.md) の表示規則で決める。

## API

`GET /api/events?from&to`（[events.md](events.md)）が `from`〜`to`（JST 日付、両端含む）の `CalendarItem[]` を `placementDate` 昇順で返す。`server/features/events/occurrences.ts` が繰り返しを展開し、予定に `placementDate`（複数日は日ごと）を付与し、タスクに表示規則を適用する。クライアントで再計算しない。同日内の順序は「終日の予定 → 時刻のある項目（予定の開始、タスクの開始または期限）→ 時刻の無いタスク」。

- 右下の追加ボタン（`AddMenu`。ホームと同じ部品で、出す種類を `kinds` で選ぶ）から予定・タスクのどちらも追加できる。初期日付は表示中の日。
- 項目の詳細ダイアログは `ItemDetailDialog`（`src/features/events/components/`）。予定とタスクの違いは本文の日時の出し方と「完了にする」の有無だけ。リストとホームでは行のチェックボックスからも完了できる。
- カレンダーの取得（`calendarItemsQueryOptions`）は `staleTime: 0`。永続化キャッシュの書き込みは 1 秒遅れるため、変更直後に再読み込みすると古い一覧が復元されることがあり、表示のたびに取り直す（キャッシュはまず出す）。

## ホームのカード

「今日」: 今日の予定と未完了のタスクを 1 つの一覧にする（`src/features/dashboard/cards/TodayCard.tsx`。カレンダーの 1 日分と同じクエリを読み、完了済みを除く）。1 項目 1 行で、印（予定は色の点、タスクはチェックボックス）・時刻・タイトルだけを出し、名前や終了時刻は出さない。明日以降は出さない。見出しから日表示へ。

## MCP ツール

`events_list`（[mcp.md](mcp.md)）。
