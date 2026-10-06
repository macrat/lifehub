# 立替（expenses）

## 目的

誰が誰のために払ったかを記録し、ユーザーどうし・ユーザーと共有（共有口座）の間の資金の貸し借りとして、帳消しにする最小限の資金移動を計算する。精算も「誰かが誰かに払った額」として同じ形で記録する。

## 画面

- 立替の一覧: お金の画面の「立替」（`/money`。`src/routes/_authenticated/money/index.tsx`。口座のタイルとタブは [money.md](money.md#画面)）。精算のタイルと履歴（ホームのタイムラインと同じく上が新しく下が古い）。履歴は無限スクロールで、古いほうのページを読み足すのは `src/features/expenses/queries.ts` の `expenseHistory`（最初の位置・ページ分け・貼り付くものの決まりは [ui.md](../ui.md#無限スクロール)）。履歴は使った日ごとに見出しを立て、その下に 1 件 1 行で並べる。行は左から印、金額、内容（上）と名前（下）で、カレンダーのリスト表示と同じ骨組み（`DateHeading` と `MarkedRow`。[ui.md](../ui.md#一覧)）に中身だけを入れ替えたもの。名前は共有のための支払い（To が共有）なら From だけ、それ以外は簿記の並びで「To ← From」（共有からの引き出しは「To ← 共有」）。印はベン図（`src/lib/ui/VennMark.tsx`）で、共有のために払ったものなら払った人の色の円 1 つ、それ以外は左が To・右が From の 2 つの円を重ね（共有は無彩色）、重なりは縦の線で左右に分ける（名前と同じ左右の並び。`src/features/expenses/components/ExpenseList.tsx`）。金額は桁を揃えて右寄せにし、縦に見比べられるようにする（行の骨組みと金額の列は入出金の一覧と同じ `src/lib/ui/LedgerList.tsx`）。行を単押しすると詳細が開き、長押しするとその詳細が入力欄で開く（アプリ全体の「単押しは閲覧、長押しは編集」。[ui.md](../ui.md#記録のシート)）。AppBar の検索窓「立替を検索」に入れたキーワードで内容を絞り込み（キーワードは検索パラメータ `q`、大文字小文字を区別しない部分一致、`src/lib/search.ts`）、その右の絞り込みボタンで詳細な検索（後述）を AppBar の下に開く。手元にあるのは読んだページだけなので、絞り込みはサーバーが掛ける（条件は `shared/validation/expenses.ts` の `expenseFilterSchema` で、URL（`src/features/expenses/search.ts` の `expenseSearchSchema`）と API が同じ規則を使う）。絞り込みを変えたら、取り直せるまで前の結果を出したままにする。精算は絞り込みに関わらず全体の貸借を示す。`add=expense` は入力を開いて始めるしるし（[architecture.md](../architecture.md#pwa)）。
- 精算のタイル（`src/features/expenses/components/SettlementGrid.tsx`）: 帳消しにする資金移動（[計算ルール](#計算ルール)）を 1 つ 1 枚のタイルで出す。タイルはレモン画面の状況のタイルと同じもの（`src/lib/ui/StatusTile.tsx` の `StatusTile` と `TileGrid`）で、見出しは「債権者 ← 債務者」（履歴の「To ← From」と同じ向き。債務者が債権者に払えば消える）、その下に大きく金額。貸し借りのある組だけを出し、1 つも無ければ「精算済み」。タップすると、その精算（From = 債務者、To = 債権者、金額、内容「精算」。`src/features/expenses/parties.ts` の `settlementExpense`）を入れた追加の入力が開く。
- 詳細な検索（`src/features/expenses/components/ExpenseFilterForm.tsx`、条件は `shared/validation/expenses.ts` の `expenseFilterSchema`、判定はサーバーの `server/features/expenses/repository.ts`）: 金額の範囲（`min` / `max`）、使った日の範囲（`since` / `until`）、To（`to`）、From（`from`）。どちらも `shared` は共有。フォームの振る舞い（入力するたびに絞り込む、範囲の端、URL、バッジ）は [ui.md](../ui.md#appbar-と検索)。
- 立替の詳細（`src/features/expenses/components/ExpenseDetailSheet.tsx`）: 金額・日付・To／From を表示し（To・From はそのユーザーの色で塗る）、鉛筆で同じ入れ物の中が入力欄に変わる（行を長押しで開いたときは最初から入力欄。`initialEditing`）。削除は三点リーダーの中。一覧に操作ボタンは置かない（行が主役で、操作は詳細に集める）。
- 立替の項目（`src/features/expenses/components/ExpenseFields.tsx`）: 追加（`ExpenseForm`）と詳細からの編集で共通。上から日付（既定は今日）、**To**（誰のために払ったか = 債務者。既定は「共有」）と **From**（払った人 = 債権者。既定はログイン中のユーザー。「共有」を選ぶと共有口座から払った = 引き出した）を簿記に倣って To を左・From を右に横並び、内容、金額、電卓。自分から自分へは払えないので、To の選択肢からは From の相手を外す（From が共有なら To に共有を出さない）。From では To の相手（共有を含む）も選べ、選ぶと To と From が入れ替わる（逆に入れたときに 1 回で直せるように。`src/features/expenses/parties.ts`）。組み立てと検証、To・From と金額の状態は `use-expense-form.ts` に置き、追加と編集で同じものを使う。詳細の編集・削除の状態と操作は `use-expense-detail.ts`。入れ物は `RecordSheet`（スマホでは下から出るシート、PC では中央のダイアログ。[ui.md](../ui.md#記録のシート)）。
- 電卓（`src/features/expenses/components/Calculator.tsx`、式の組み立てと計算は `src/features/expenses/calculator.ts`）: 金額欄がそのまま電卓の入力欄で、式（`1200+800`）を直接書く。金額欄ではそれぞれの数を桁区切りで出す（`1,200+800`）が、式の状態はカンマを持たない。計算結果の表示欄は別に持たず、`=` で金額欄の式を結果に置き換える。× ÷ を + − より先に計算し、円にするため結果は四捨五入する。キーパッドは金額欄の下の余白をすべて使い、金額欄はソフトキーボードを出さない（`inputMode: none`）。
- 精算は専用の記録を持たない。From に払った人、To に受け取った人を選んで立替として追加する（精算のタイルから始めると入った状態で開く）。

## 計算ルール

- 当事者はユーザーと共有（共有口座）。X が Y のために払う（X→Y）と、X に債権、Y に債務が amount 円生じる。
  - 夫が 2 人の旅行費を払う = 夫→共有: 共有の債務、夫の債権。
  - 夫の買い物を妻が立て替える = 妻→夫: 夫の債務、妻の債権。
  - 共有口座から引き出す = 共有→その人: その人の債務、共有の債権。
  - 精算「B が A に払った」も B→A の行として同じ規則に入るので、払えば貸し借りが減る。
- 当事者ごとに債権と債務を差し引いた正味を出し、最も大きい債権者と最も大きい債務者を突き合わせて資金移動を決めていく。正味にしてから組むので、循環（A→B→共有→A）は打ち消される。
  - 正味が 0 でない当事者が n 人なら移動は高々 n − 1 回。当事者は 3 者（ユーザー 2 人と共有）なので、これが最小になる。
  - WHY NOT 一般の最小化: 当事者が増えると最小の組み方を探すのは組み合わせの問題になるが、利用者は 2 人なので要らない。
- 計算は `shared/expenses.ts` の `settlementsOf` 1 箇所に置き、サーバー（`getSettlements`）とクライアント（`useSettlements`）が同じものを使う。
  - サーバーは `(from_user_id, to_user_id)` ごとの合計を SQL で出してから渡すので、履歴が増えても精算の応答は変わらない。
  - クライアントはその合計（`expenses.totals`）を受け取って精算を導き、書き込みの結果を先に出すとき（楽観的更新）は合計に 1 件分を足し引きする。WHY NOT 精算そのものを持つ: 移動の組み方からは 1 件分を足し引きできない。

## データ

`expenses`（[data-model.md](../data-model.md)）。`from_user_id`・`to_user_id` の null は共有。両方が null の行は持てない（`expenses_parties_check`。共有から共有へは貸し借りが生じない）。

## API（`server/features/expenses/routes.ts`）

| 手続き | 種類 | 内容 |
|---|---|---|
| `expenses.list` | 読み出し | 履歴の 1 ページ（`{ items, nextCursor }`。items は古い順）。入力は続きの `before`（YYYY-MM-DD）と絞り込み（`q` / `min` / `max` / `since` / `until` / `to` / `from`）。新しいほうから 50 件ほどで、日の途中では切らない（同じ日の立替は必ず同じページに入る。件数は 50 を超えうる）。`nextCursor` はさらに前があるときの次の `before`（このページの最も古い日）。絞り込みは画面と同じ（範囲は両端を含み、キーワードは内容の大文字小文字を区別しない部分一致） |
| `expenses.totals` | 読み出し | 精算の元になる「誰が誰のために払ったか」ごとの合計（`[{ fromUserId, toUserId, amount }]`。最大 6 行） |
| `expenses.create` | 書き込み | 立替（精算を含む）を追加。From と To に同じ人は選べない。`id` を指定するとその ID で作る（同じ ID の再送は二重に作らない）。値は返さない |
| `expenses.update` | 書き込み | 編集。入力は記録の `id` と全項目（追加と同じ形）で、全項目を置き換える。値は返さない |
| `expenses.delete` | 書き込み | 削除（入力は `id`） |

入力スキーマは `shared/validation/expenses.ts`。

## MCP ツール

`add_expense`, `update_expense`。払った人・誰のためかの共有は `"shared"`。精算は `get_overview`（と書いた後の結果）、履歴は `read_timeline`、消すのは `delete_entry`（[mcp.md](mcp.md)）。

## ホーム

ホームのタイルには出さない（ホームのタイルの 1 枠目は天気。[weather.md](weather.md)）。精算はお金の画面で見る。立替はホームのタイムライン（[home.md](home.md)）には並ぶ。
