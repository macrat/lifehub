# 立替（expenses）

## 目的

誰が誰のために払ったかを借方・貸方で記録し、2 人の貸借残高を計算する。精算も「誰かが誰かに払った額」として同じ形で記録する。

## 画面

- 立替 `/expenses`: 残高（「A が B に n 円払うと精算」、0 なら「精算済み」）と履歴（新しい順）。履歴の行は共有なら From だけ、相手が決まっていれば「From → To」。行をタップすると詳細が開く。AppBar の検索窓に入れたキーワードで履歴を内容で絞り込む（キーワードは検索パラメータ `q`、大文字小文字を区別しない部分一致、`src/lib/search.ts`）。件数が少なく一覧は既に手元にあるので、サーバーには投げず手元で絞り込む。残高は絞り込みに関わらず全体の貸借を示す。
- 立替の詳細（`src/features/expenses/components/ExpenseDetailDialog.tsx`）: 金額・日付・To／From を表示し、そこから編集（同じフォーム）と削除を行う。一覧に削除ボタンは置かない（行が主役で、操作は詳細に集める）。
- 立替フォーム（`src/features/expenses/components/ExpenseForm.tsx`）: 追加と編集で共通。上から日付（既定は今日）、**To**（誰のために払ったか。既定は「共有」= 折半。ユーザーを選ぶと全額そのユーザーの負担）と **From**（払った人。既定はログイン中のユーザー）を簿記に倣って To を左・From を右に横並び、内容、金額、電卓。ホームのクイック追加でも使う。全画面にするほど項目は多くないので `FormSheet`（スマホでは下から出るシート、PC では中央のダイアログ。[architecture.md](../architecture.md)）で出す。
- 電卓（`src/features/expenses/components/Calculator.tsx`、式の組み立てと計算は `src/features/expenses/calculator.ts`）: 金額欄がそのまま電卓の入力欄で、式（`1200+800`）を直接書く。計算結果の表示欄は別に持たず、`=` で金額欄の式を結果に置き換える。× ÷ を + − より先に計算し、円にするため結果は四捨五入する。キーパッドは金額欄の下の余白をすべて使い、金額欄はソフトキーボードを出さない（`inputMode: none`）。
- 精算ボタンは無い。精算は From に払った人、To に受け取った人を選んで立替として追加する。

## データ

`expenses`（[data-model.md](../data-model.md)）。`to_user_id` が null なら共有。

## 前提

利用者は 2 人固定。残高の計算は登録順の先頭 2 人を A, B として行い、ユーザーがちょうど 2 人でなければ 400 を返す（3 人以上のとき先頭 2 人だけで黙って計算しない）。

## 計算ルール

A が B に対して持つ債権 = (Σ A→共有 − Σ B→共有) / 2 + Σ A→B − Σ B→A（X→Y = X が Y のために払った額。端数は切り捨て）。精算「B が A に払った」も B→A の行として同じ式に入るので、払えば債権が減る。計算式は `shared/expenses.ts` の `balanceOf` 1 箇所に置き、サーバー（`getBalance`）とクライアントの楽観的更新が同じものを使う。サーバーは `(from_user_id, to_user_id)` ごとの合計を SQL で出してから渡すので、履歴が増えても残高の応答は変わらない。

## API（`server/features/expenses/routes.ts`）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/expenses` | 履歴（新しい順） |
| GET | `/api/expenses/balance` | 残高（`{ fromUserId, toUserId, amount }`。0 なら `amount: 0`） |
| POST | `/api/expenses` | 立替（精算を含む）を追加。From と To に同じ人は選べない |
| PUT | `/api/expenses/:id` | 編集。全項目を置き換える（入力は追加と同じ形） |
| DELETE | `/api/expenses/:id` | 削除 |

入力スキーマは `shared/validation/expenses.ts`。

## MCP ツール

`expenses_get_balance`, `expenses_list`, `expenses_add`（[mcp.md](mcp.md)）。

## ホームのカード

「立替残高」: 「A が B に n 円払うと精算」の 1 行表示。0 なら「精算済み」。立替ページと同じ `balanceQueryOptions` を読む（`src/features/dashboard/cards/BalanceCard.tsx`）。どちらの画面も同じ `BalanceSummary` を出すので、行き来するときは残高がその場から動く（View Transition。名前は `balance`）。
