# 立替（expenses）

## 目的

誰が誰のために払ったかを記録し、ユーザーどうし・ユーザーと共有（共有口座）の間の資金の貸し借りとして、帳消しにする最小限の資金移動を計算する。精算も「誰かが誰かに払った額」として同じ形で記録する。

## 画面

- 立替の一覧: お金の画面（`/money`）で、取り込んだ入出金と 1 本に並ぶ（画面の組み立て、一覧の行の骨組みと並び、検索窓、ページ分けは [money.md](money.md#画面)）。立替の行の日は使った日で、補足は名前。名前は共有のための支払い（To が共有）なら From だけ、それ以外は簿記の並びで「To ← From」（共有からの引き出しは「To ← 共有」）。印はベン図（`src/lib/ui/VennMark.tsx`）で、共有のために払ったものなら払った人の色の円 1 つ、それ以外は左が To・右が From の 2 つの円を重ね（共有は無彩色）、重なりは縦の線で左右に分ける（名前と同じ左右の並び。`src/features/expenses/components/PartiesMark.tsx`）。行を単押しすると詳細が開き、長押しするとその詳細が入力欄で開く（アプリ全体の「単押しは閲覧、長押しは編集」。[ui.md](../ui.md#記録のシート)）。検索窓のキーワード（検索パラメータ `q`。大文字小文字を区別しない部分一致、`src/lib/search.ts`）で内容を絞り込み、その右の絞り込みボタンで詳細な検索（後述）を AppBar の下に開く。手元にあるのは読んだページだけなので、絞り込みはサーバーが掛ける（条件は `shared/validation/expenses.ts` の `expenseFilterSchema` で、URL（`src/features/expenses/search.ts` の `expenseSearchSchema`）と API（`expenses.list`）が同じ規則を使う。取り込んだ入出金への読み替えは [money.md](money.md#画面)）。絞り込みを変えたら、取り直せるまで前の結果を出したままにする。精算は絞り込みに関わらず全体の貸借を示す。`add=expense` は入力を開いて始めるしるし（[architecture.md](../architecture.md#pwa)）。
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
- 取り込んだ入出金のうち、ルールで入金・出金にしたものも「共有」との立替として入る（[money.md](money.md#取り込みルール)）。
- 計算は `shared/expenses.ts` の `settlementsOf` 1 箇所に置き、サーバー（`getSettlements`）とクライアント（`useSettlements`）が同じものを使う。
  - サーバーは `(from_user_id, to_user_id)` ごとの合計を SQL で出してから渡すので、履歴が増えても精算の応答は変わらない。
  - クライアントはその合計（`expenses.totals`）を受け取って精算を導き、書き込みの結果を先に出すとき（楽観的更新）は合計に 1 件分を足し引きする。WHY NOT 精算そのものを持つ: 移動の組み方からは 1 件分を足し引きできない。

## 立替スケジュール

決まった日に決まった内容で発生する立替（共有口座への定期の入金、個人の口座からの口座振替の支払い）を、日が来たら自動で記録する。

- 画面: `/admin/expense-schedules`（`src/routes/_authenticated/admin.expense-schedules.tsx`。設定の「お金」セクションの「立替スケジュール」から開く）。AppBar は戻るボタンと「立替スケジュール」。一覧（`src/features/expenses/components/ExpenseScheduleList.tsx`。形は設定から開くほかの管理の画面と同じ `EditableList`）はスケジュールを作った順に並べ、行は左に記録する立替の印（お金の画面の立替の印と同じ `PartiesMark`）、内容と説明（金額・繰り返し・次に記録する日）、右端の鉛筆。右下の追加ボタン（「立替スケジュールを追加」）で追加し、鉛筆で変更、変更のシートの三点リーダーで削除する（`ExpenseScheduleSheet`。状態と操作は `use-expense-schedule-sheet.tsx`）。項目は立替と同じ（`ExpenseFields`）で、日付は「最初の日」、その下に「繰り返し」（毎日・毎週・毎月・毎年。既定は毎月）。終わりの日は持たず、止めるならスケジュールを削除する。
- 立替スケジュールの追加・変更・削除はこの画面だけで行う。立替の入力・詳細・一覧はスケジュールに触れず、記録された立替は手で入れた立替と同じ普通の立替で、スケジュールとのつながりも持たない。WHY: 立替の入力欄に普段は使わない項目を足さず、記録された立替を直す・消すときに「この回だけ」のような区別を持ち込まない。
- 回の日（`shared/expenses.ts` の `scheduleDate`）: どの回も最初の日から数える（前の回から数えない）。毎月・毎年でその日が無い月（31 日、2/29）はその月の末日にし、次の月には元の日に戻る（1/31 → 2/28 → 3/31。ずれていかない）。WHY NOT RRULE（予定・タスクの繰り返し）: RRULE の毎月はその日が無い月を飛ばし、月末払いが記録されない月ができる。繰り返しは 4 通りだけなので、日付の足し算で足りる。
- 記録: 追加したとき、最初の日から今日までの回をその場で記録する（最初の日が先ならその日まで何も記録しない）。先の日の回は、日付が変わってすぐの Cron（`/api/cron/expenses`。`server/features/expenses/service.ts` の `recordScheduledExpenses`）が、日が来た回を記録する。Cron が止まっていた日の回は、次に動いたときにまとめて記録する。記録した人はスケジュールを作った人。
- 記録し終えた日（`generated_through`）で、どの回まで記録したかを覚える。記録した立替を消しても記録し直さない。
- 変更（全項目の置き換え）は、まだ記録していない回（明日から）にだけ効く。記録した立替はそのまま（直すならその立替を直す）。削除しても記録した立替は残る。

## データ

`expenses`・`expense_schedules`（[data-model.md](../data-model.md)）。`from_user_id`・`to_user_id` の null は共有。両方が null の行は持てない（`expenses_parties_check`・`expense_schedules_parties_check`。共有から共有へは貸し借りが生じない）。

- `expense_schedules`: 立替スケジュール。立替と同じ項目に、`starts_on`（最初の日）、`frequency`（`daily` / `weekly` / `monthly` / `yearly`。CHECK 制約）、`generated_through`（記録し終えた日。最初は最初の日の前日）。

## API（`server/features/expenses/routes.ts`）

| 手続き | 種類 | 内容 |
|---|---|---|
| `expenses.list` | 読み出し | お金の画面の一覧の 1 ページ（`{ items, nextCursor }`。items は古い順で、立替（`type: "expense"`）と取り込んだ入出金（`type: "transaction"`）が混ざる）。入力は続きの `before`（YYYY-MM-DD）と絞り込み（`q` / `min` / `max` / `since` / `until` / `to` / `from`。`expenseListQuerySchema`）。立替と入出金を合わせて新しいほうから 50 件ほどで、日の途中では切らない（同じ日の記録は必ず同じページに入る。件数は 50 を超えうる）。`nextCursor` はさらに前があるときの次の `before`（このページの最も古い日）。表ごとに区切りの日を集めて 1 本にする（`server/lib/history-source.ts` の `mergeHistoryPage`。立替は `service.ts` の `historySource`、入出金は money の `historySource` が渡し、どの feature も他の feature の表を直接読まない）。入出金への絞り込みの読み替えは [money.md](money.md#画面) |
| `expenses.totals` | 読み出し | 精算の元になる「誰が誰のために払ったか」ごとの合計（`[{ fromUserId, toUserId, amount }]`）。立替の組ごとと、取り込んだ入出金のうちルールで「共有」との立替にしたものの組ごと（[money.md](money.md#取り込みルール)。同じ組が 2 行になりうるが、精算の式は足し合わせる） |
| `expenses.create` | 書き込み | 立替（精算を含む）を追加。From と To に同じ人は選べない。`id` を指定するとその ID で作る（同じ ID の再送は二重に作らない）。値は返さない |
| `expenses.update` | 書き込み | 編集。入力は記録の `id` と全項目（追加と同じ形）で、全項目を置き換える。値は返さない |
| `expenses.delete` | 書き込み | 削除（入力は `id`） |
| `expenses.schedules` | 読み出し | 立替スケジュール（作った順。`[{ id, fromUserId, toUserId, amount, description, startsOn, frequency }]`）。次に記録する日は画面が `nextScheduleDate` で数える |
| `expenses.createSchedule` | 書き込み | 立替スケジュールを追加（項目は立替と同じで、日付の代わりに `startsOn`（最初の日）と `frequency`。組み合わせの規則も立替と同じ。`expenseScheduleSchema`）。今日までの回をその場で立替として記録する。`id` を指定するとその ID で作る（同じ ID の再送は二重に作らない）。値は返さない |
| `expenses.updateSchedule` | 書き込み | 変更。入力は `id` と全項目で、全項目を置き換える（まだ記録していない回にだけ効く）。値は返さない |
| `expenses.deleteSchedule` | 書き込み | 削除（入力は `id`）。記録した立替は残る |

入力スキーマは `shared/validation/expenses.ts`。

## MCP ツール

`add_expense`, `update_expense`。払った人・誰のためかの共有は `"shared"`。精算は `get_overview`（と書いた後の結果）、履歴は `read_timeline`、消すのは `delete_entry`（[mcp.md](mcp.md)）。

## ホーム

ホームのタイルには出さない（ホームのタイルの 1 枠目は天気。[weather.md](weather.md)）。精算はお金の画面で見る。立替はホームのタイムライン（[home.md](home.md)）には並ぶ。
