# レモンの木の世話記録（lemon）

## 目的

レモンの木 1 本の世話を記録し、項目ごとに最終実施日からの経過日数を表示する。

## 画面

- レモン `/lemon`: 項目ごとの最終実施日と経過日数（水やり・葉水・施肥・開花・収穫）、記録の追加、履歴（新しい順）、削除。状況のタイルをタップするとその種別を選んだ状態で記録フォームが開く（右下の追加ボタンは水やり）。
- 記録フォーム（`src/features/lemon/components/CareLogForm.tsx`）: 種別、日時（既定は今）、メモ（`note` 種別は必須）。ホームのクイック追加でも使う。

## データ

`lemon_care_logs`（[data-model.md](../data-model.md)）。種別は `water` / `mist` / `fertilize` / `bloom` / `harvest` / `note`。対象はレモンの木 1 本に固定し、複数植物への拡張は必要になった時点で `plants` テーブルと `plant_id` を追加して行う。

## API（`server/features/lemon/routes.ts`）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/lemon/status` | 種別ごとの最終実施日時と経過日数（`note` を除く 5 種別。`shared/validation/lemon.ts` の `TRACKED_CARE_TYPES`） |
| GET | `/api/lemon/logs` | 履歴（新しい順） |
| POST | `/api/lemon/logs` | 記録を追加 |
| DELETE | `/api/lemon/logs/:id` | 記録を削除 |

入力スキーマは `shared/validation/lemon.ts`。状態（最終実施日時と経過日数）の導き方は `shared/lemon.ts` の `careStatuses` 1 箇所に置き、サーバー（`getStatus`）とクライアントの楽観的更新が同じものを使う。

## MCP ツール

`lemon_get_status`, `lemon_log_care`（[mcp.md](mcp.md)）。

## ホームのカード

「レモン」: 水やり・葉水それぞれの最終実施日からの経過日数。レモンページと同じ `lemonStatusQueryOptions` を読む（`src/features/dashboard/cards/LemonCard.tsx`）。タイルをタップするとレモンページと同じくその種別を選んだ状態で記録フォームが開く。
