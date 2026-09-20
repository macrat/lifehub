# タスク（tasks）

## 目的

やること全般（買い物を含む）。開始日時と期限日時を別々に設定できる（どちらも任意）。繰り返し設定可。開始日時・期限日時にプッシュ通知。専用画面は持たず、カレンダー／イベント画面の中で予定と並べて確認・管理する。

## 画面

- 専用画面なし。カレンダー `/calendar` とイベント `/events` に予定と並べて表示する（[calendar.md](calendar.md)）。
- タスクのフォームは `src/features/tasks/components/TaskForm.tsx`。入力項目: タイトル、メモ、担当（自分／相手／共有）、開始日時、期限日時、繰り返し、開始時に通知、期限時に通知。
- カードには「完了」ボタンがあり、カレンダー・イベント・ホームのいずれからも完了にできる。完了の取り消しも可。
- 繰り返しタスクの編集・削除は「この回だけ」「これ以降すべて」「すべて」の 3 択。

## 表示規則（placementDate）

タスクは「どの日付に置くか」を次の規則で決める。予定と同じグリッド・同じリストに、種別が見分けられる見た目で並べる。

| 状態 | 表示位置 |
|---|---|
| 未完了・開始日時が未来 | 開始日時の位置 |
| 未完了・開始日時が過去（または今日）、または開始日時が未設定 | **今日**の位置（完了するまで毎日繰り越される） |
| 完了 | 完了した日時の位置 |

- 開始日時が未設定の未完了タスクは、期限日時の有無にかかわらず今日の位置に置く。
- 期限日時は表示位置には使わず、カードに「期限」として併記する。期限超過はカードを強調表示する。
- 繰り返しタスクは発生（occurrence）ごとに同じ規則を適用する。ただし**同じタスクは同時に最大 2 つまでしか表示しない**:
  - 表示するのは、キャンセルされていない未完了の発生のうち基準日時が最も早い 2 つ。過去の発生は今日の位置、未来の発生はその日時の位置に置く。3 つ目以降の未来の発生は表示しない。
  - 未完了の発生 N は、発生 N+2 の基準日時が到来した時点で**放棄**され、表示されなくなる（放棄は計算で導き、保存しない）。つまり未完了の繰り越しは「2 つ後の発生が来るまで」。
  - 例: 毎週月曜のタスクで 9/7 を未完了のまま 9/14 を迎えると 9/7 と 9/14 が今日の位置に並び、9/21 を迎えると 9/7 は消えて 9/14 と 9/21 が並ぶ。
- 完了操作は `task_completions` に `completed_at` を記録し、そのタスクは完了日時の位置へ移る。
- 基準日時 = `starts_at`（未設定なら `due_at`）。繰り返しの DTSTART も同じ。
- 繰り返しの走査は「未完了の発生を基準日時順に走査し、2 つ見つかるか、表示範囲の終わりを超えた時点で打ち切る」。放棄の判定には 2 つ先の発生の基準日時を使う。系列の最後の回は 2 つ先が無いので放棄されず、完了するまで今日に残る（単発タスクと同じ振る舞い）。
- 走査の外で完了した回（放棄後に MCP から完了した等）も完了日に表示する。
- 表示規則の実装は `server/features/tasks/service.ts` の `listOccurrences`。`calendar` service はこれをそのまま統合する。

## データ

`tasks`, `task_overrides`, `task_completions`（[data-model.md](../data-model.md)）。

- `occurrence_key` は単発なら `'single'`、繰り返しなら発生の基準日時の ISO 8601（UTC）。
- 繰り返しでは `starts_at` と `due_at` の両方が発生ごとに同じ間隔でずれる。

## API（`server/features/tasks/routes.ts`）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/tasks?from&to` | 期間内に表示位置を持つ発生（表示規則適用済み） |
| GET | `/api/tasks/:id` | マスターを返す |
| POST | `/api/tasks` | 作成 |
| PUT | `/api/tasks/:id` | 更新。`scope`（`all` / `this` / `following`）と `occurrenceKey` を指定 |
| DELETE | `/api/tasks/:id` | 削除。`scope` と `occurrenceKey` を指定 |
| POST | `/api/tasks/:id/complete` | `occurrenceKey` を完了にする |
| DELETE | `/api/tasks/:id/complete` | 完了を取り消す（body に `occurrenceKey`） |

- `this`: `task_overrides` を upsert（タイトル・メモ・開始・期限）。`following`: 元の `rrule` に UNTIL を付け、対象回以降の例外と完了記録を消し、新しいマスターを作る。`all`: マスターを更新し、基準日時か `rrule` が変わったら例外を捨てる（完了記録は履歴として残す）。
- `occurrenceKey` はルール上に実在する発生でなければ拒否する（400）。

画面の一覧は `calendar` の統合 API から取得する。入力スキーマは `shared/validation/tasks.ts`。

## MCP ツール

`tasks_list`, `tasks_create`, `tasks_complete`, `tasks_update`（[mcp.md](mcp.md)）。

## 通知

`starts_at` と `due_at` それぞれの時刻ちょうど（`notify_at_start` / `notify_at_due` で個別に ON/OFF）。送信先は担当者（共有なら 2 人）の全端末。通知キーは `task:<id>:<occurrenceKey>:start` / `:due`。

## ホームのカード

「今日のタスク」: 今日の位置にある未完了タスク（期限が近い順）。カード上で完了操作可。なければ「なし」。`server/features/tasks/dashboard.ts`。
