# カレンダー（calendar）

## 目的

予定とタスク（[events.md](events.md)）を 1 つの時系列に見せる画面の feature。サーバー側の feature は持たず、データの読み書きはすべて `events` の API に送る。

## 画面

| 画面 | パス | 内容 |
|---|---|---|
| カレンダー | `/calendar?view=month\|week\|day\|list&date=YYYY-MM-DD`（リスト表示の絞り込みは `from` / `to` / `kind`=`all\|event\|task` / `participant`=`all` かユーザー ID / `completed`=`all\|open\|done` / `q`） | 予定とタスクを 1 つの画面で、月（グリッド）・週／日（タイムライン）・リストの 4 通りに表示し、追加・編集・削除する。初期表示は今月の月表示。 |

表示は AppBar 右端のメニューで切り替える。すべて `CalendarItem[]` だけを読み、予定とタスクの差は描画と操作（完了の有無）にのみ現れる。部品は MUI で自作（`src/features/calendar/components/`）し、汎用カレンダーライブラリは使わない。週の始まりは月曜。

- **月**（`MonthGrid`）: Google カレンダー流のレーン配置。週ごとに、複数日・終日の予定を「開始列と長さ」の順に 1 本のバー（開始日・終了日だけ角丸）として先に置き、残りの日ごとの項目（時刻付き予定は「● タイトル」、タスクはチェック印付き）を空いたレーンに詰める（`lane-layout.ts`）。行の高さに入りきらないレーンは「+n」。グリッドは画面の残り全部を占め、レーン数は行の高さから実測する。日をタップするとその日の日表示へ移る（スマホでは項目はタップできず、セルのどこを押しても日を選ぶ。PC では項目をクリックすると詳細）。
- **週・日**（`TimelineView` + `TimeGrid`）: Google カレンダーと同じタイムライン。上に日付の見出しと終日欄（終日・複数日の予定、時刻の無いタスク。月と同じレーン配置）、下に 0〜24 時の時間軸（`TimeGrid`。縦にスクロールする部分）。時間指定の予定は開始〜終了の高さの塗りブロック、時刻付き（期限 → 開始の優先）のタスクはその時刻に薄い背景の小さなブロック。同じ時間帯に重なる項目は横に並べる（`timeline-layout.ts`: 重なり合う集まりごとに列を割り当て、幅を等分）。今日の列には現在時刻の赤い線。初期スクロールは今日なら現在時刻の少し上、それ以外は 7 時。週表示で日付の見出しをタップすると日表示へ。空いている所を縦にドラッグすると、その時間帯（15 分刻み、最短 30 分）を選んで予定を追加できる（`use-time-drag.ts`。マウス・ペンは押した時点から、タッチは長押しから始めてタップや縦スクロール・横スワイプと分ける。ドラッグ中は選んでいる時間帯を枠として出し、離すと予定のフォームがその日時で開く。列をまたいでも日は変わらない）。
- **リスト**（`ListView`）: 時系列の一覧（Google カレンダーの「スケジュール」）。AppBar に検索、絞り込みボタンで期間・種別（予定／タスク）・参加者・完了状態を開く。既定の期間は「表示中の日の前 7 日〜後 21 日」。
- **状態**: 表示・日付・絞り込みはすべて検索パラメータ（`use-calendar-page.ts` がそこから取得範囲・見出し・前後の移動を導き、ページは描画だけ）。表示や日付の切り替え（表示の選択、日のタップ、選択ダイアログ、今日）は履歴に積み、戻るで前の表示に戻れる。スワイプでの前後移動と絞り込みの入力は履歴を置き換える。
- **移動**: AppBar の見出し（月なら年月、週なら期間、日なら日付）をタップすると選択ダイアログ（`DatePickerDialog`）。見出しが指す単位と選べる単位を揃え、月表示は年を ‹ › で送って 12 か月から、週・日表示は月を ‹ › で送って月グリッド（月表示と同じ 6 週）の週の行・日から選ぶ。選んだ範囲が今日を含むときは今日へ移る（「今日」が選ばれている見え方に揃える）。スマホでは月・週・日の表示を左右にスワイプすると前後の月・週・日へ（`use-swipe.ts`。横の移動が縦の 2 倍を超えたときだけ反応し、縦スクロールと混ざらない）。前後ボタンは置かない。「今日」ボタンで今日へ。
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

- 右下の追加ボタン（`AddMenu`。ホームと同じ部品で、出す種類を `kinds` で選ぶ）から予定・タスクのどちらも追加できる。初期日付は表示中の日。週・日表示のドラッグから開く予定のフォームだけはページが直接開く（初期値が選んだ時間帯で決まるため）。
- 項目の詳細ダイアログは `ItemDetailDialog`（`src/features/events/components/`）。予定とタスクの違いは本文の日時の出し方と「完了にする」の有無だけ。リストとホームでは行のチェックボックスからも完了できる。
- 取得のキャッシュは JST の暦月単位（`calendarMonthQueryOptions`。キーは `['calendar', 'YYYY-MM']`）で、表示に必要な範囲は `useCalendarItems(range)` が範囲に掛かる月を繋いで返す。表示範囲をキーにすると月・週・日・リストの切り替えごとに別のキーになり、必ず一度空になってしまう。暦月なら同じ日を見ているどの表示も同じキャッシュに当たるので、切り替えても手元の内容が出たまま裏で取り直し、届いた月から差し替わる（ホームの「今日」カードも同じ月のキャッシュを読む）。
- 月は互いに重ならず、サーバーが月をまたぐ予定を日ごとの項目にして返すため、繋ぐときは範囲で絞るだけでよい（重複せず `placementDate` 順も保たれる）。タスクの表示規則も「未完了の先頭 2 件」を発生の先頭から数えるので、月に分けても結果は変わらない。

## ホームのカード

「今日」: 今日の予定と未完了のタスクを 1 つの一覧にする（`src/features/dashboard/cards/TodayCard.tsx`。カレンダーと同じ `useCalendarItems` で今日だけを読み、完了済みを除く）。1 項目 1 行で、印（予定は色の点、タスクはチェックボックス）・時刻・タイトルだけを出し、名前や終了時刻は出さない。明日以降は出さない。見出しから日表示へ。

## MCP ツール

`events_list`（[mcp.md](mcp.md)）。
