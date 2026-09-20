# 立替・精算（expenses）

## 目的

どちらが立て替えたかと金額を記録し、常に折半で貸借残高を計算する。精算で残高をゼロに戻す。

## 画面

- 立替 `/expenses`: 残高（「A→B に n 円」、0 なら「精算済み」）、立替履歴（新しい順）、精算履歴、立替の追加・削除、精算の実行。
- 立替フォーム（`src/features/expenses/components/ExpenseForm.tsx`）: 支払者（既定は自分）、金額、内容、日付（既定は今日）。ホームのクイック追加でも使う。
- 精算は「現在の残高をそのまま精算する」1 ボタン。金額の手入力はしない。

## データ

`expenses`, `settlements`（[data-model.md](../data-model.md)）。

## 計算ルール

立替残高（A が B に対して持つ債権）= (ΣA 立替 − ΣB 立替) / 2 − ΣA→B 精算 + ΣB→A 精算。端数は切り捨て。計算は `server/features/expenses/service.ts` だけで行う。

## API（`server/features/expenses/routes.ts`）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/expenses` | 立替と精算の履歴 |
| GET | `/api/expenses/balance` | 残高（`{ fromUserId, toUserId, amount }`。0 なら `amount: 0`） |
| POST | `/api/expenses` | 立替を追加 |
| DELETE | `/api/expenses/:id` | 立替を削除 |
| POST | `/api/expenses/settle` | 現在の残高で精算 |

入力スキーマは `shared/validation/expenses.ts`。

## MCP ツール

`expenses_get_balance`, `expenses_add`, `expenses_settle`（[mcp.md](mcp.md)）。

## ホームのカード

「立替残高」: 「A→B に n 円」の 1 行表示。0 なら「精算済み」。`server/features/expenses/dashboard.ts`。
