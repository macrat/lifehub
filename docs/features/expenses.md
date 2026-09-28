# 立替（expenses）

## 目的

誰が誰のために払ったかを借方・貸方で記録し、2 人の貸借残高を計算する。精算も「誰かが誰かに払った額」として同じ形で記録する。

## 画面

- 立替 `/expenses?q=&min=&max=&since=YYYY-MM-DD&until=YYYY-MM-DD&to=shared|ユーザー ID&from=ユーザー ID`: 残高（「A が B に n 円払うと精算」、0 なら「精算済み」）と履歴（上が古く下が新しい）。履歴は無限スクロールで、最初は今日の最後の記録を画面の一番下（スマホは下部ナビのすぐ上）に出し、未来の日付の立替はその下に続けてスクロールするまで見せない（`src/lib/ui/HistoryList.tsx`）。上の端へ近づくと古いほうのページをサーバーから読み足す（`src/features/expenses/queries.ts` の `useExpenseHistory`、`src/lib/ui/InfiniteScroll.tsx`）。履歴は増え続けるので全件は取らず、新しいほうから 1 ページ（50 件ほど）ずつ取る。絞り込みのフォームと残高は一覧の上に貼り付き、ホームのタイルと同じく下へスクロールすると AppBar の裏へ隠れ、少し上へ戻すと出てくる（`src/lib/ui/ScrollAwayHeader.tsx`）。絞り込みのフォームを開いている間は隠れない。絞り込みを変えるとこの最初の位置へ戻る。履歴は使った日ごとに見出しを立て、その下に 1 件 1 行で並べる。行は左から印、金額、内容（上）と名前（下）で、カレンダーのリスト表示と同じ骨組み（`DateHeading` と `MarkedRow`。[architecture.md](../architecture.md)）に中身だけを入れ替えたもの。名前は共有なら From だけ、相手が決まっていれば簿記の並びで「To ← From」。印はベン図（`src/lib/ui/VennMark.tsx`）で、共有のために払ったものなら払った人の色の円 1 つ、人から人へのものは左が To・右が From の 2 つの円を重ね、重なりは縦の線で左右に分ける（名前と同じ左右の並び。`src/features/expenses/components/ExpenseList.tsx`）。金額は桁を揃えて右寄せにし、縦に見比べられるようにする。行を単押しすると詳細が開き、長押しするとその詳細が入力欄で開く（アプリ全体の「単押しは閲覧、長押しは編集」。[architecture.md](../architecture.md)）。AppBar の検索窓「立替を検索」に入れたキーワードで内容を絞り込み（キーワードは検索パラメータ `q`、大文字小文字を区別しない部分一致、`src/lib/search.ts`）、その右の絞り込みボタンで詳細な検索（後述）を AppBar の下に開く。手元にあるのは読んだページだけなので、絞り込みはサーバーが掛ける（条件は `shared/validation/expenses.ts` の `expenseFilterSchema` で、URL と API が同じ規則を使う）。絞り込みを変えたら、取り直せるまで前の結果を出したままにする。残高は絞り込みに関わらず全体の貸借を示す。`add=expense` は入力を開いて始めるしるし（[architecture.md](../architecture.md#pwa)）。
- 詳細な検索（`src/features/expenses/components/ExpenseFilterForm.tsx`、条件は `shared/validation/expenses.ts` の `expenseFilterSchema`、判定はサーバーの `server/features/expenses/repository.ts`）: 金額の範囲（`min` / `max`）、使った日の範囲（`since` / `until`）、To（`to`。`shared` は共有）、From（`from`）。範囲は両端を含み、省略した端は制限しない（下限だけ・終了日だけでも絞り込める）。「検索」ボタンは無く、入力するたびに絞り込む。絞り込みは URL に持つので再読み込みや共有で戻り、選んでいない条件は URL に残さない。効いている条件の数は絞り込みボタンのバッジに出る（範囲は上下で 1 つ）。
- 立替の詳細（`src/features/expenses/components/ExpenseDetailSheet.tsx`）: 金額・日付・To／From を表示し（To・From はそのユーザーの色で塗る）、鉛筆で同じ入れ物の中が入力欄に変わる（行を長押しで開いたときは最初から入力欄。`initialEditing`）。削除は三点リーダーの中。一覧に操作ボタンは置かない（行が主役で、操作は詳細に集める）。
- 立替の項目（`src/features/expenses/components/ExpenseFields.tsx`）: 追加（`ExpenseForm`）と詳細からの編集で共通。上から日付（既定は今日）、**To**（誰のために払ったか。既定は「共有」= 折半。ユーザーを選ぶと全額そのユーザーの負担）と **From**（払った人。既定はログイン中のユーザー）を簿記に倣って To を左・From を右に横並び、内容、金額、電卓。本人から本人へは払えないので、To の選択肢からは From の人を外す。From では To の人も選べ、選ぶと To と From が入れ替わる（逆に入れたときに 1 回で直せるように。`src/features/expenses/parties.ts`）。ホームのクイック追加でも使う。組み立てと検証、To・From と金額の状態は `use-expense-form.ts` に置き、追加と編集で同じものを使う。入れ物は `RecordSheet`（スマホでは下から出るシート、PC では中央のダイアログ。[architecture.md](../architecture.md)）。
- 電卓（`src/features/expenses/components/Calculator.tsx`、式の組み立てと計算は `src/features/expenses/calculator.ts`）: 金額欄がそのまま電卓の入力欄で、式（`1200+800`）を直接書く。計算結果の表示欄は別に持たず、`=` で金額欄の式を結果に置き換える。× ÷ を + − より先に計算し、円にするため結果は四捨五入する。キーパッドは金額欄の下の余白をすべて使い、金額欄はソフトキーボードを出さない（`inputMode: none`）。
- 精算ボタンは無い。精算は From に払った人、To に受け取った人を選んで立替として追加する。

## データ

`expenses`（[data-model.md](../data-model.md)）。`to_user_id` が null なら共有。

## 前提

利用者は 2 人固定。残高の計算は登録順の先頭 2 人を A, B として行い、ユーザーがちょうど 2 人でなければ計算しない（3 人以上のとき先頭 2 人だけで黙って計算しない。画面は理由を出し、MCP は残高を省く）。

## 計算ルール

A が B に対して持つ債権 = (Σ A→共有 − Σ B→共有) / 2 + Σ A→B − Σ B→A（X→Y = X が Y のために払った額。端数は切り捨て）。精算「B が A に払った」も B→A の行として同じ式に入るので、払えば債権が減る。計算式は `shared/expenses.ts` の `balanceOf` 1 箇所に置き、サーバー（`getBalance`）とクライアントが同じものを使う。サーバーは `(from_user_id, to_user_id)` ごとの合計を SQL で出してから渡すので、履歴が増えても残高の応答は変わらない。クライアントはその合計（`GET /api/expenses/totals`）を受け取って残高を導き（`useBalance`）、書き込みの結果を先に出すとき（楽観的更新）は合計に 1 件分を足し引きする。残高そのものからは折半の端数が分からず正しく足し引きできないため、残高ではなく合計を持つ。

## API（`server/features/expenses/routes.ts`）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/expenses?before=YYYY-MM-DD&q=&min=&max=&since=&until=&to=&from=` | 履歴の 1 ページ（`{ items, nextCursor }`。items は古い順）。新しいほうから 50 件ほどで、日の途中では切らない（同じ日の立替は必ず同じページに入る。件数は 50 を超えうる）。`nextCursor` はさらに前があるときの次の `before`（このページの最も古い日）。絞り込みは画面と同じ（範囲は両端を含み、キーワードは内容の大文字小文字を区別しない部分一致） |
| GET | `/api/expenses/totals` | 残高の元になる「誰が誰のために払ったか」ごとの合計（`[{ fromUserId, toUserId, amount }]`。最大 6 行） |
| POST | `/api/expenses` | 立替（精算を含む）を追加。From と To に同じ人は選べない。`id` を指定するとその ID で作る（同じ ID の再送は二重に作らない）。応答は 204 |
| PUT | `/api/expenses/:id` | 編集。全項目を置き換える（入力は追加と同じ形）。応答は 204 |
| DELETE | `/api/expenses/:id` | 削除 |

入力スキーマは `shared/validation/expenses.ts`。

## MCP ツール

`add_expense`, `update_expense`。残高は `get_overview`（と書いた後の結果）、履歴は `read_timeline`、消すのは `delete_entry`（[mcp.md](mcp.md)）。

## ホームのカード

ホームのタイルには出さない（ホームのタイルの 1 枠目は天気。[weather.md](weather.md)）。残高は立替の画面で見る。立替はホームのタイムライン（[home.md](home.md)）には並ぶ。
