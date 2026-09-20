# 立替（expenses）

## 目的

誰が誰のために払ったかを借方・貸方で記録し、2 人の貸借残高を計算する。精算も「誰かが誰かに払った額」として同じ形で記録する。

## 画面

- 立替 `/expenses`: 残高（「A が B に n 円払うと精算」、0 なら「精算済み」）と履歴（新しい順、削除可）。履歴の行は共有なら From だけ、相手が決まっていれば「From → To」。
- 立替フォーム（`src/features/expenses/components/ExpenseForm.tsx`）: 金額、内容、**To**（誰のために払ったか。既定は「共有」= 折半。ユーザーを選ぶと全額そのユーザーの負担）と **From**（払った人。既定はログイン中のユーザー）を簿記に倣って To を左・From を右に横並び、日付（既定は今日）。ホームのクイック追加でも使う。
- 精算ボタンは無い。精算は From に払った人、To に受け取った人を選んで立替として追加する。

## データ

`expenses`（[data-model.md](../data-model.md)）。`to_user_id` が null なら共有。

## 前提

利用者は 2 人固定。残高の計算は登録順の先頭 2 人を A, B として行い、ユーザーがちょうど 2 人でなければ 400 を返す（3 人以上のとき先頭 2 人だけで黙って計算しない）。

## 計算ルール

A が B に対して持つ債権 = (Σ A→共有 − Σ B→共有) / 2 + Σ A→B − Σ B→A（X→Y = X が Y のために払った額。端数は切り捨て）。精算「B が A に払った」も B→A の行として同じ式に入るので、払えば債権が減る。計算は `server/features/expenses/service.ts` だけで行う。

## API（`server/features/expenses/routes.ts`）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/expenses` | 履歴（新しい順） |
| GET | `/api/expenses/balance` | 残高（`{ fromUserId, toUserId, amount }`。0 なら `amount: 0`） |
| POST | `/api/expenses` | 立替（精算を含む）を追加。From と To に同じ人は選べない |
| DELETE | `/api/expenses/:id` | 削除 |

入力スキーマは `shared/validation/expenses.ts`。

## MCP ツール

`expenses_get_balance`, `expenses_list`, `expenses_add`（[mcp.md](mcp.md)）。

## ホームのカード

「立替残高」: 「A が B に n 円払うと精算」の 1 行表示。0 なら「精算済み」。立替ページと同じ `balanceQueryOptions` を読む（`src/features/dashboard/cards/BalanceCard.tsx`）。
