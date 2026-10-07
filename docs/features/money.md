# お金（money）

## 目的

家のお金を 1 か所で扱う。誰が誰のために払ったか（立替）を記録して、ユーザーどうし・ユーザーと共有（共有口座）の間の貸し借りを帳消しにする最小限の資金移動（精算）を計算する。Money Forward ME に登録した銀行口座・証券口座・クレジットカードの今の値（残高・評価額・次回の引き落とし）と入出金を日に 1 度取り込み、立替と同じ一覧・同じ精算に入れる。

取り込んだものは読むだけで、LifeHub からは書き換えない（直すのは Money Forward で。次の取り込みで反映される。内容欄の読み替えと精算への入れ方は[取り込みルール](#取り込みルール)で決める）。

## 画面

- お金 `/money?q=&min=&max=&since=YYYY-MM-DD&until=YYYY-MM-DD&to=&from=&add=expense`（`src/routes/_authenticated/money.tsx`。下部ナビの「お金」。絵は `src/features/money/icon.ts` の `MoneyIcon`）。上から口座のタイル、精算のタイル、お金の記録の一覧。タイルと絞り込みのフォームは、ホームのタイルと同じく下へスクロールすると AppBar の裏へ隠れる（絞り込みのフォームを開いている間は隠さない）。右下の追加ボタンは立替の追加。`add=expense` は立替の入力を開いて始めるしるし（[architecture.md](../architecture.md#pwa)）。
  - AppBar の検索窓「記録を検索」に入れたキーワードで内容を絞り込み（検索パラメータ `q`。大文字小文字を区別しない部分一致、`src/lib/search.ts`）、その右の絞り込みボタンで詳細な検索（下記）を AppBar の下に開く。手元にあるのは読んだページだけなので、絞り込みはサーバーが掛ける（条件は `shared/validation/money.ts` の `moneyFilterSchema` で、URL（`src/features/money/search.ts` の `moneySearchSchema`）と API（`money.list`）が同じ規則を使う）。絞り込みを変えたら、取り直せるまで前の結果を出したままにする。一覧が空のときは「まだ記録はありません」（絞り込んでいれば「一致する記録はありません」）。タイルは絞り込みに関わらず全体を示す。
- 一覧（`src/features/money/components/MoneyList.tsx`）: 手で入れた立替と取り込んだ入出金を 1 本に並べる、上が新しく下が古い無限スクロール（`src/features/money/queries.ts` の `moneyHistory`。最初の位置・ページ分け・貼り付くものの決まりは [ui.md](../ui.md#無限スクロール)）。日ごとに見出しを立て、その下に 1 件 1 行で並べる。同じ日の中は記録した順（取り込んだ入出金は最初に取り込んだ時刻。`shared/money.ts` の `sortMoneyRecords`）。行の骨組みはカレンダーのリスト表示と同じ（`DateHeading` と `MarkedRow`。[ui.md](../ui.md#一覧)）で、左から印、金額、内容（上）と補足（下）。金額は桁を揃えて右寄せにし、列の幅は読んだ中で一番幅を取る金額に合わせる。
  - 印は当事者のベン図（`src/features/money/components/PartiesMark.tsx`。`src/lib/ui/VennMark.tsx`）: 共有のために払ったものなら払った人の色の円 1 つ、それ以外は左が To・右が From の 2 つの円を重ね（共有は無彩色）、重なりは縦の線で左右に分ける。当事者を持たない記録（ただの支出の入出金）は無彩色の点（ホームのタイムラインの丸と同じ色）。
  - 立替の行: 補足は名前。共有のための支払い（To が共有）なら From だけ、それ以外は簿記の並びで「To ← From」（共有からの引き出しは「To ← 共有」。`src/features/money/parties.ts` の `partiesInOrder`）。金額は額だけ。
  - 取り込んだ入出金の行: 内容はルールで読み替えた後の内容欄、補足は金融機関。金額は入金に + を付け、符号は円記号の後ろ（「¥+50,000」「¥-3,200」。`src/lib/yen.ts` の `formatSignedYen`）。
  - 行を単押しすると詳細が開き、長押しするとその詳細が入力欄で開く（アプリ全体の「単押しは閲覧、長押しは編集」。[ui.md](../ui.md#記録のシート)。取り込んだ入出金は読むだけなので長押しでも閲覧）。どちらの詳細を開くかは `MoneyRecordSheet` が決める（ホームのタイムラインからも同じものを開く）。一覧に操作ボタンは置かない（行が主役で、操作は詳細に集める）。
- 精算のタイル（`src/features/money/components/SettlementGrid.tsx`）: 帳消しにする資金移動（[精算](#精算)）を 1 つ 1 枚のタイルで出す。タイルはレモン画面の状況のタイルと同じもの（`src/lib/ui/StatusTile.tsx` の `StatusTile` と `TileGrid`）で、見出しは「債権者 ← 債務者」（一覧の「To ← From」と同じ向き。債務者が債権者に払えば消える）、その下に大きく金額。貸し借りのある組だけを出し、1 つも無ければ「精算済み」。タップすると、その精算（From = 債務者、To = 債権者、金額、内容「精算」。`src/features/money/parties.ts` の `settlementExpense`）を入れた立替の入力が開く。精算は専用の記録を持たず、From に払った人、To に受け取った人を選んで立替として追加する。
- 口座のタイル（`src/features/money/components/AccountGrid.tsx`）: 取り込む口座（[口座の指定](#口座の指定)）を 1 つ 1 枚、環境変数に書いた順に並べる（スマホは 3 列、PC は 4 列。スマホの 3 列でも 7 桁の金額が収まるよう、値の字はほかのタイルより小さい）。タイルは精算と同じもの（`StatusTile`）で、名前（金融機関）・値・補足の 3 段。値は銀行なら残高、証券なら評価額、クレジットカードなら次回の引き落とし額で、補足は「残高」「評価額」、カードは次回の引き落とし日（「次回 10/27」。スマホの 3 列に収まるよう曜日は付けない。日が読めなければ「次回」）。まだ取り込んでいない値や読めなかった値は「—」。押すとその口座の推移（下記）が開く。取り込む口座が無ければ（環境変数が無ければ）段ごと出さない。
- 口座の推移 `/money/balances?accounts=名前&accounts=名前`（`src/routes/_authenticated/money_.balances.tsx`。口座のタイルから開く。下部ナビには置かず、お金のタブの中の画面として扱う）: 選んだ口座の値の推移を積み上げた、塗りつぶし付きの折れ線グラフ（`src/features/money/components/BalanceChart.tsx`）。値は銀行なら残高、証券なら評価額、クレジットカードなら負債額（Money Forward の利用残高の大きさに - を付けた負の数）。負債は 0 より下へ積み、残高・評価額は 0 より上へ積む（ECharts の積み上げは正と負を別々に積む）。押したときの合計は負債を引いた額。
  - AppBar は戻るボタン・出している期間（「2026/7/6 〜 10/6」。年をまたげば両方に年）・絞り込みボタン。絞り込みでは出す口座をチェックで選ぶ（URL の accounts。タイルから開いたときは押したタイルの口座だけ。選び直しは履歴に積まないので、戻るでお金の画面へ戻る）。どれも選んでいなければ「表示する口座を選んでください」。
  - 最初は今日までの過去 3 か月を出す。ピンチ・マウスホイールで期間を拡大縮小し（最短 1 週間）、ドラッグで前後へ動かす。出している期間の始まりより、期間の長さの半分手前まで読んでいなければ古いほうの記録を読み足す（`src/features/money/use-balance-chart.ts`）ので、過去へ動かし続けられる（記録を始めた日まで）。
  - 縦軸は、出している期間の値（積み上げた値）の最小と最大から、値の幅の 1 割ずつ外へ広げてきりのよい値に丸めた範囲。値がすべて 0 以上なら下端は 0 を下回らず、すべて 0 以下（カードだけ）なら上端は 0 を上回らない（`src/features/money/balance-chart.ts` の `axisRange`）。目盛りは 1 万円以上を万で数える。
  - グラフのどこかを押す・マウスを乗せると、その日の日付と口座ごとの金額（2 つ以上なら合計も）が出る。
  - 記録の無い日（取り込めなかった日）は、その口座の前の日の値のままとして描く（積み上げは同じ日の値を足すので、日を揃える。`toSeries`）。口座の色は口座の並びで決まり、選び直しても変わらない。
  - 描画は ECharts（`echarts`。この画面のチャンクにだけ入る）。WHY ECharts: ピンチでの拡大縮小・ドラッグでの移動・押した位置の値の表示・積み上げの塗りつぶしをどれも設定だけで持ち、使う部品だけを読み込める。WHY NOT MUI X Charts: 拡大縮小が有料版の機能。
- 詳細な検索（`src/features/money/components/MoneyFilterForm.tsx`）: 金額の範囲（`min` / `max`）、日付の範囲（`since` / `until`）、To（`to`）、From（`from`）。どちらも `shared` は共有。フォームの振る舞い（入力するたびに絞り込む、範囲の端、URL、バッジ）は [ui.md](../ui.md#appbar-と検索)。判定はサーバー（`server/features/money/repository.ts` の `findPage`）で、立替にも入出金にも同じ条件で掛ける: 金額は額の大きさ（出金も入金も絶対値）、To・From は当事者の列。当事者を持たない記録（ただの支出の入出金）は、To・From のどちらかで絞り込んでいれば出さない（共有の絞り込みにも入れない）。
- 立替の詳細（`src/features/money/components/ExpenseDetailSheet.tsx`）: 金額・日付・To／From を表示し（To・From はそのユーザーの色で塗る）、鉛筆で同じ入れ物の中が入力欄に変わる（行を長押しで開いたときは最初から入力欄。`initialEditing`）。削除は三点リーダーの中。状態と操作は `use-expense-detail.ts`。
- 取り込んだ入出金の詳細（`src/features/money/components/ImportedRecordSheet.tsx`）: 金額・日付・金融機関。読むだけなので鉛筆も三点リーダーも出さない。入れ物は `RecordSheet`。
- 立替の項目（`src/features/money/components/ExpenseFields.tsx`）: 追加（`ExpenseForm`）と詳細からの編集、立替スケジュールで共通。上から日付（既定は今日）、**To**（誰のために払ったか = 債務者。既定は「共有」）と **From**（払った人 = 債権者。既定はログイン中のユーザー。「共有」を選ぶと共有口座から払った = 引き出した）を簿記に倣って To を左・From を右に横並び、内容、金額、電卓。自分から自分へは払えないので、To の選択肢からは From の相手を外す（From が共有なら To に共有を出さない）。From では To の相手（共有を含む）も選べ、選ぶと To と From が入れ替わる（逆に入れたときに 1 回で直せるように。`src/features/money/parties.ts`）。組み立てと検証、To・From と金額の状態は `use-expense-form.ts` に置く。入れ物は `RecordSheet`（スマホでは下から出るシート、PC では中央のダイアログ。[ui.md](../ui.md#記録のシート)）。
- 電卓（`src/features/money/components/Calculator.tsx`、式の組み立てと計算は `src/features/money/calculator.ts`）: 金額欄がそのまま電卓の入力欄で、式（`1200+800`）を直接書く。金額欄ではそれぞれの数を桁区切りで出す（`1,200+800`）が、式の状態はカンマを持たない。計算結果の表示欄は別に持たず、`=` で金額欄の式を結果に置き換える。× ÷ を + − より先に計算し、円にするため結果は四捨五入する。キーパッドは金額欄の下の余白をすべて使い、金額欄はソフトキーボードを出さない（`inputMode: none`）。

## お金の記録

- 手で入れた立替と、Money Forward から取り込んだ入出金は、どちらも同じ形の「お金の記録」（`shared/money.ts` の `MoneyRecord`。表は `money_records`）。違うのは次の所だけで、記録の `account`（取り込んだ金融機関。手で入れた立替は null）で見分ける。
  - 立替: From・To のどちらかを必ず持つ。金額は正の数。画面・MCP から追加・編集・削除できる。
  - 取り込んだ入出金: 金額は入金が正・出金が負。当事者は[取り込みルール](#取り込みルール)で「共有」との立替にしたものだけが持ち、どちらも持たなければただの支出（精算に入らない）。画面・MCP からは直せない（サーバーの書き込み（`repository.ts` の `update`・`remove`）は手で入れた立替の行だけを書き、取り込んだ入出金を指すと理由を返す。`service.ts` の `notWritable`）。
- WHY 1 つの表と 1 つの形: 画面は立替と入出金を 1 本の一覧に並べ、同じ絞り込みと精算に入れる。表や形を分けると、一覧のページ分け・絞り込み・精算の合計・タイムライン・MCP・楽観的更新のどれにも、2 つをつなぐ読み替えが要る。

## 精算

- 当事者はユーザーと共有（共有口座）。X が Y のために払う（X→Y）と、X に債権、Y に債務が amount 円生じる。
  - 夫が 2 人の旅行費を払う = 夫→共有: 共有の債務、夫の債権。
  - 夫の買い物を妻が立て替える = 妻→夫: 夫の債務、妻の債権。
  - 共有口座から引き出す = 共有→その人: その人の債務、共有の債権。
  - 精算「B が A に払った」も B→A の行として同じ規則に入るので、払えば貸し借りが減る。
  - 取り込んだ入出金のうちルールで入金・出金にしたものも、同じく当事者を持つので同じ規則に入る（額は大きさ）。
- 当事者ごとに債権と債務を差し引いた正味を出し、最も大きい債権者と最も大きい債務者を突き合わせて資金移動を決めていく。正味にしてから組むので、循環（A→B→共有→A）は打ち消される。
  - 正味が 0 でない当事者が n 人なら移動は高々 n − 1 回。当事者は 3 者（ユーザー 2 人と共有）なので、これが最小になる。
  - WHY NOT 一般の最小化: 当事者が増えると最小の組み方を探すのは組み合わせの問題になるが、利用者は 2 人なので要らない。
- 計算は `shared/money.ts` の `settlementsOf` 1 箇所に置き、サーバー（`getSettlements`）とクライアント（`useSettlements`）が同じものを使う。
  - サーバーは `(from_user_id, to_user_id)` ごとの額の大きさの合計を SQL で出してから渡すので、記録が増えても精算の応答は変わらない（`repository.ts` の `sumByParties`）。
  - クライアントはその合計（`money.totals`）を受け取って精算を導き、書き込みの結果を先に出すとき（楽観的更新）は合計に 1 件分を足し引きする。WHY NOT 精算そのものを持つ: 移動の組み方からは 1 件分を足し引きできない。

## 立替スケジュール

決まった日に決まった内容で発生する立替（共有口座への定期の入金、個人の口座からの口座振替の支払い）を、日が来たら自動で記録する。

- 画面: `/admin/expense-schedules`（`src/routes/_authenticated/admin.expense-schedules.tsx`。設定の「お金」セクションの「立替スケジュール」から開く）。AppBar は戻るボタンと「立替スケジュール」。一覧（`src/features/money/components/ExpenseScheduleList.tsx`。形は設定から開くほかの管理の画面と同じ `EditableList`）はスケジュールを作った順に並べ、行は左に記録する立替の印（お金の画面の印と同じ `PartiesMark`）、内容と説明（金額・繰り返し・次に記録する日）、右端の鉛筆。右下の追加ボタン（「立替スケジュールを追加」）で追加し、鉛筆で変更、変更のシートの三点リーダーで削除する（`ExpenseScheduleSheet`。状態と操作は `use-expense-schedule-sheet.ts`）。項目は立替と同じ（`ExpenseFields`）で、日付は「最初の日」、その下に「繰り返し」（毎日・毎週・毎月・毎年。既定は毎月）。終わりの日は持たず、止めるならスケジュールを削除する。
- 立替スケジュールの追加・変更・削除はこの画面だけで行う。立替の入力・詳細・一覧はスケジュールに触れず、記録された立替は手で入れた立替と同じ普通の立替で、スケジュールとのつながりも持たない。WHY: 立替の入力欄に普段は使わない項目を足さず、記録された立替を直す・消すときに「この回だけ」のような区別を持ち込まない。
- 回の日（`shared/money.ts` の `scheduleDate`）: どの回も最初の日から数える（前の回から数えない）。毎月・毎年でその日が無い月（31 日、2/29）はその月の末日にし、次の月には元の日に戻る（1/31 → 2/28 → 3/31。ずれていかない）。WHY NOT RRULE（予定・タスクの繰り返し）: RRULE の毎月はその日が無い月を飛ばし、月末払いが記録されない月ができる。繰り返しは 4 通りだけなので、日付の足し算で足りる。
- 記録: 追加したとき、最初の日から今日までの回をその場で記録する（最初の日が先ならその日まで何も記録しない）。先の日の回は、日付が変わってすぐの Cron（`/api/cron/money/schedules`。`server/features/money/service.ts` の `recordScheduledExpenses`）が、日が来た回を記録する。Cron が止まっていた日の回は、次に動いたときにまとめて記録する。記録した人はスケジュールを作った人。
- 記録し終えた日（`generated_through`）で、どの回まで記録したかを覚える。記録した立替を消しても記録し直さない。
- 変更（全項目の置き換え）は、まだ記録していない回（明日から）にだけ効く。記録した立替はそのまま（直すならその立替を直す）。削除しても記録した立替は残る。

## 口座の指定

- 取り込む口座はサーバーの環境変数 `MONEYFORWARD_ACCOUNTS` で決める（`server/lib/env.ts` の `moneyAccountsSchema`）。`種類:名前` をカンマで区切って並べ（`bank:三井住友銀行,securities:SBI証券,card:楽天カード`）、並べた順がタイルの順になる。
  - 種類は `bank`（銀行。残高）・`securities`（証券。評価額）・`card`（クレジットカード。次回の引き落とし）。`shared/money.ts` の `MONEY_ACCOUNT_KINDS`。
  - WHY 種類を書かせる: タイルに出す値が種類で決まり、Money Forward の画面から種類を読み取るより、書いてもらうほうが確か。
  - 名前は Money Forward の口座一覧に出る金融機関の名前。画面や CSV の名前は前方一致で引き当て、いくつも合えば一番長い名前にする（`server/features/money/parse.ts` の `matchAccount`。口座の種別が後ろに付いても引き当てられ、「楽天カード」と「楽天カード（家族）」を取り違えない）。
  - 書き方が違えば（種類が無い・名前が重なる）サーバーは起動しない。
- 環境変数から外した口座の行と明細は、次の取り込みで消す（[取り込み](#取り込み)）。WHY NOT 読むたびに今の口座で絞る: 画面・タイムライン・MCP のどの読み出しにも同じ条件が要り、消えない行が溜まり続ける。外したことが画面に出るのは次の取り込みから。
- ログインには `MONEYFORWARD_EMAIL`・`MONEYFORWARD_PASSWORD` を使う。Money Forward ID で 2 段階認証（認証アプリ）を使っているなら、その秘密鍵を `MONEYFORWARD_TOTP_SECRET` に渡す（`otpauth` でコードを作って答える）。本番ではログインの 2 つと口座が欠けていれば起動しない（`PRODUCTION_REQUIRED`。欠けたままだと取り込みが何もせずに正常終了し、気づけないため）。値の置き場所は [operations.md](../operations.md#terraforminfra)。

## 取り込み

- 日に 1 度、朝 7:00（JST）の Cron（`/api/cron/money`。`vercel.json`）が `server/features/money/service.ts` の `syncMoneyForward` を呼ぶ。
- Money Forward ME には個人で使える API が無いので、人が使うのと同じ画面をブラウザ（Playwright）で開いて読む（`server/features/money/moneyforward.ts`）。画面の作りに頼る所はこのファイルにまとめ、読んだ文字の読み方は `parse.ts` に置く（ブラウザ無しでテストできる）。
  - ログイン: ME の `/sign_in` から Money Forward ID を経て戻ってくる。途中の画面（メール、パスワード、2 段階認証、アカウントの選択、パスキーの案内）は出たり出なかったりし順も決まっていないので、ME に戻るまで今出ている画面を見て 1 つずつ進める。メールの確認コードを求められたら答えられないので、2 段階認証（認証アプリ）を設定するよう言って失敗する。
  - 入出金: 家計簿の CSV ダウンロード（`/cf/csv`。Money Forward の**有料プラン**の機能）を先月と今月の 2 か月分読み、Shift_JIS を文字に直して見出しの名前で列を引く（`server/features/money/parse.ts`）。振替（「振替」の列が 1。カードの引き落としや口座の間の送金で、Money Forward が口座の間の移し替えとみなしたもの）もほかの明細と同じに取り込む。WHY NOT 振替を除く: CSV には相手の口座が載っておらず、取り込まない口座との出入り（証券口座への入金など）まで消える。取り込む口座どうしの振替は両側の明細が並ぶ。取り込むときに今のルールで内容欄を読み替える（[取り込みルール](#取り込みルール)）。WHY CSV: 画面の表を読むより見た目の変更に左右されず、明細の ID（同じ明細を 2 度入れないための鍵）も載っている。WHY 先月も: カードの明細は使った日から数日遅れて届くので、月の初めに読むと先月の終わりの明細がまだ増える。
  - 口座の値の記録: 取り込むたびに、口座の値をその日（JST）の記録としても残す（`money_balances`。同じ日は上書き）。WHY 自分で記録する: Money Forward の資産推移は分類（預金・株式など）ごとの合計だけで、口座ごとの推移を読める画面が無い。そのため推移は記録を始めた日からしか無い。
  - 口座の値: 残高・評価額は口座一覧（`/accounts`）の金額の列、カードの引き落とし額はカードの詳細の見出し「引き落とし予定額：…」（「未定」なら読めない値。カードごとにタブを開いて並べて読む）、引き落とし日はトップの口座の並びの「引き落とし日:(…)」。読むのは文字だけなので、画像・フォント・動画は読み込まず、ページは文書ができた所で読む。
  - Vercel の関数には Chromium が無いので、AWS Lambda 向けに縮めた Chromium（`@sparticuz/chromium-min`）を取り込みのたびに配布元から展開して使う。WHY NOT 本体を同梱する `@sparticuz/chromium`: 全 API が 1 つの関数なので、1 日 1 回しか使わない 60MB をどの要求のコールドスタートにも背負わせることになる。同じ理由で、ブラウザ・CSV・2 段階認証の部品（`moneyforward.ts`・`parse.ts`）は取り込みのときだけ読み込む。ローカルでは Playwright の Chromium を使う。
- 書き込み: 読んだ明細の最も古い日から最も新しい日までを、Money Forward の今の明細に置き換える（同じ明細（`source_id`）は変わっていれば上書きし、載っていない明細は Money Forward で消されたものとして消す）。口座の値は口座ごとに上書きし、環境変数から外した口座の行と明細は消す。どれも 1 つのトランザクションで書く（`repository.ts` の `saveImport`）。明細を書く・消すのは取り込んだ入出金の行だけで、同じ日の手で入れた立替には触らない。
  - WHY 置き換える範囲を読んだ明細の日付で決める: Money Forward は月の始まりの日を設定で変えられ、CSV が暦の月とずれることがある。暦の月で置き換えると、CSV に載らなかった日の明細を消してしまう。
- 失敗（ログインできない、CSV ではないものが返る、形の合わない行がある）は何も書かずに投げる。前回の値が残り、Cron の失敗として Sentry に残る。形の合わない行を黙って飛ばさないのは、Money Forward の形が変わったときに明細が消えていくのに気づけなくなるため。

## 取り込みルール

取り込んだ入出金の内容欄を読み替え、入金・出金を「共有」との立替として精算に入れる。

- 画面 `/admin/money-rules`（`src/routes/_authenticated/admin.money-rules.tsx`。設定の「お金」セクションの「取り込みルール」から開く）。AppBar は戻るボタンと「取り込みルール」。
  - 一覧（`src/features/money/components/MoneyRuleList.tsx`。形は設定から開くほかの管理の画面と同じ `EditableList`）: 上から当てる順に並べ、行は左端の取っ手、当たった入出金の印（お金の画面の印と同じ。支出は無彩色の点、入金は対象者の色の円 1 つ、出金は左に対象者・右に無彩色の円。`shared/money.ts` の `ruleParties`）、パターンと説明（「「$1 さん」に置換・入金 太郎・一覧に表示しない」。`describeRule`）、右端の鉛筆。取っ手を引くと並べ替える（`@dnd-kit`。キーボードでも動かせる）。
  - 追加は右下の追加ボタン（「ルールを追加」。末尾に足す）、変更は鉛筆で、どちらも同じシート（`MoneyRuleSheet`。状態と保存は `use-money-rule-form.ts`）を開く。シートは上から、パターン（正規表現）、「内容欄を置換」のスイッチと置換後の内容欄（スイッチがオフなら入力できない）、種別（支出・入金・出金）と対象者（支出なら選べない。入金・出金に変えると自分が入る）、「一覧に表示しない」のスイッチ。削除はシートの三点リーダー。ルールはいくつでも持てる（上限 100）。
  - 正しくない（パターンが空か正規表現として読めない、置換するのに置換後が空、入金・出金なのに対象者が無い）ときは、欄に誤りを出して保存しない。保存・並べ替え・削除のたびに並び全体を保存する（`src/features/money/use-money-rules.ts`。保存のたびに過去の入出金を読み替え直す）。
- 当て方（`server/features/money/rules.ts` の `applyRules`）: Money Forward の内容欄そのままに、上から順にパターン（JavaScript の正規表現）を当て、最初に当たったルールだけを使う。パターンは内容欄全体と一致したときだけ当たる（`^(?:パターン)$` と同じ。`shared/money.ts` の `fullMatch`。`a|b` のような選択も全体に掛かる）。WHY 完全一致: 部分一致だと、短いパターンが思わぬ内容欄にも当たり、上から順に見るので後ろのルールを黙って隠す。一部だけで見分けたいときは `.*` を書く。どれにも当たらなければ元のまま（ただの支出）。
  - 置換は内容欄全体を置換後の内容欄にする。置換後の内容欄には `String.prototype.replace` と同じ書き方で、キャプチャ（`$1`、名前付きは `$<名前>`）・当たった所全体（`$&`）・`$` そのもの（`$$`）を差し込める。WHY 当たった部分だけでなく全体: 長い内容欄を短い名前にしたいとき、当たった部分だけを置き換えると残りが付いてくる。
  - 入金（対象者が共有口座へ入れた）は From を対象者・To を共有に、出金（対象者が共有口座から引き出した）は From を共有・To を対象者にする（`shared/money.ts` の `ruleParties`。画面の印とサーバーの読み替えが同じものを使う）。記録は立替と同じ当事者を持つので、そのまま[精算](#精算)・絞り込み・印の色に入る。
  - 「一覧に表示しない」をオンにしたルールに当たった入出金は、お金の画面の一覧・ホームのタイムライン（MCP の `read_timeline` も同じ問い合わせ）に出さない。種別と対象者はほかのルールと同じに効き、入金・出金なら精算には入る。WHY 精算から外さない: 表示のスイッチで精算の額まで変わると、見えない所で残高が動く。精算から外したいなら種別を支出にする。
- 過去の入出金にも効く: 取り込んだ入出金は元の内容欄（`original_description`）と読み替えた後（`description`・`from_user_id`・`to_user_id`・`hidden`）の両方を持ち、ルールを保存するたびにすべての入出金を元の内容欄から読み替え直し、読み替えが変わった行だけを書く（`server/features/money/service.ts` の `saveRules`。並べ替えだけなら、たいてい書く行は無い。ルールの置き換えと読み替えは 1 つのトランザクション）。取り込み直さずに済む。

## データ

`money_records`・`money_schedules`・`money_accounts`・`money_balances`・`money_rules`（[data-model.md](../data-model.md)）。`from_user_id`・`to_user_id` の null は共有。

- `money_records`: お金の記録（[お金の記録](#お金の記録)）。手で入れた立替（`account` が null）は From・To のどちらかと記録した人（`created_by`）を持つ（`money_records_manual_check`。共有から共有へは貸し借りが生じない）。取り込んだ入出金（`account` が金融機関の名前）は `source_id`（Money Forward の明細の ID。一意）と `original_description`（Money Forward の内容欄そのまま）を持ち（`money_records_import_check`）、`description` はルールで読み替えた後、`hidden` はルールで一覧に出さないとしたもの。Money Forward の分類（大項目・中項目）は取り込まない（Money Forward の自動の分類は正しいとは限らず、LifeHub からは直せないので、出しても頼れない）。
- `money_schedules`: 立替スケジュール。立替と同じ項目に、`starts_on`（最初の日）、`frequency`（`daily` / `weekly` / `monthly` / `yearly`。CHECK 制約）、`generated_through`（記録し終えた日。最初は最初の日の前日）。
- `money_rules`: 取り込みルール（`position` の順）。`pattern`、`replace_description`、`replacement`、`kind`（`spending` / `deposit` / `withdrawal`）、`user_id`（支出なら null。CHECK 制約）、`hidden`（一覧に表示しない）。家族で 1 つの並びで、保存は並び全体の置き換え。
- `money_accounts`: 口座の名前ごとの今の値（残高・評価額 `balance`、カードの引き落とし `withdrawal_amount`・`withdrawal_on`、取り込んだ日時 `fetched_at`）。読めなかった値は null。
- `money_balances`: 口座の値の日ごとの記録（`account` と `recorded_on` が主キー）。`balance` は銀行なら残高、証券なら評価額、カードなら負債額を負の数で持つ（取り込みのときに向きを揃える。`server/features/money/service.ts` の `syncMoneyForward`）。環境変数から外した口座の行は次の取り込みで消す。

## API（`server/features/money/routes.ts`）

| 手続き | 種類 | 内容 |
|---|---|---|
| `money.list` | 読み出し | お金の画面の一覧の 1 ページ（`{ items, nextCursor }`。items は古い順のお金の記録 `[{ id, fromUserId, toUserId, amount, description, occurredOn, createdAt, account }]`）。入力は続きの `before`（YYYY-MM-DD）と絞り込み（`q` / `min` / `max` / `since` / `until` / `to` / `from`。`moneyListQuerySchema`）。新しいほうから 50 件ほどで、日の途中では切らない（同じ日の記録は必ず同じページに入る。件数は 50 を超えうる。`server/lib/db/history.ts` の `findHistoryPage`）。`nextCursor` はさらに前があるときの次の `before`（このページの最も古い日）。ルールで一覧に出さないとした入出金は出さない |
| `money.totals` | 読み出し | 精算の元になる「誰が誰のために払ったか」ごとの額の大きさの合計（`[{ fromUserId, toUserId, amount }]`）。当事者を持たない記録は入らない |
| `money.create` | 書き込み | 立替（精算を含む）を追加。From と To に同じ人は選べない。`id` を指定するとその ID で作る（同じ ID の再送は二重に作らない）。値は返さない |
| `money.update` | 書き込み | 立替の編集。入力は記録の `id` と全項目（追加と同じ形）で、全項目を置き換える。取り込んだ入出金は直せない。値は返さない |
| `money.delete` | 書き込み | 立替の削除（入力は `id`）。取り込んだ入出金は消せない |
| `money.schedules` | 読み出し | 立替スケジュール（作った順。`[{ id, fromUserId, toUserId, amount, description, startsOn, frequency }]`）。次に記録する日は画面が `nextScheduleDate` で数える |
| `money.createSchedule` | 書き込み | 立替スケジュールを追加（項目は立替と同じで、日付の代わりに `startsOn`（最初の日）と `frequency`。組み合わせの規則も立替と同じ。`expenseScheduleSchema`）。今日までの回をその場で立替として記録する。`id` を指定するとその ID で作る（同じ ID の再送は二重に作らない）。値は返さない |
| `money.updateSchedule` | 書き込み | 変更。入力は `id` と全項目で、全項目を置き換える（まだ記録していない回にだけ効く）。値は返さない |
| `money.deleteSchedule` | 書き込み | 削除（入力は `id`）。記録した立替は残る |
| `money.accounts` | 読み出し | 口座のタイル（`[{ name, kind, balance, withdrawalAmount, withdrawalOn, fetchedAt }]`）。環境変数に書いた順で、まだ取り込んでいない口座も値を null にして並べる |
| `money.balances` | 読み出し | 口座の値の推移の 1 ページ（入力 `{ before? }`。`{ items: [{ account, on, amount }], nextCursor }`）。before（省けば明日）より前の 6 か月の記録を日の古い順に、今取り込んでいる口座すべての分。nextCursor はそのページの始まりの日で、それより前の記録が無ければ null。WHY 件数ではなく期間で区切る: グラフは期間で見るもので、開いたときに要る期間（最初に出す 3 か月と、その半分手前までの先読み）が 1 回の取得で揃う（`shared/money.ts` の `BALANCE_PAGE_MONTHS`） |
| `money.rules` | 読み出し | 取り込みルールの並び（上から順。`[{ id, pattern, replaceDescription, replacement, kind, userId, hidden }]`） |
| `money.saveRules` | 書き込み | ルールの並び全体を置き換え（入力は `moneyRulesSchema`）、取り込み済みの入出金を読み替え直す。値は返さない |

入力スキーマは `shared/validation/money.ts`。取り込んだ入出金を書く手続きは無い（取り込みは Cron だけが行う）。

### クエリ

キーは `['money', …]`（`src/features/money/queries.ts`）。立替の書き込みは一覧（`moneyHistory`）・精算の元の合計・タイムラインへ先回りして書き（一覧とタイムラインは `src/features/timeline/queries.ts` の `timelineRecordCache`。お金の記録はどちらにも同じ形で並ぶ）、書いた後にそれらを取り直す。ルールの保存は読み替えの結果を先回りせず、一覧・合計・タイムラインを取り直す。

## MCP ツール

`add_expense`, `update_expense`（`server/features/money/mcp.ts`。書けるのは立替だけ）。払った人・誰のためかの共有は `"shared"`。精算は `get_overview`（と書いた後の結果）、記録は `read_timeline`（種類は `expense`）、消すのは `delete_entry`（[mcp.md](mcp.md)）。口座の今の値は `get_overview` の `moneyAccounts`。

取り込んだ入出金も `read_timeline` の `expense` として返し、`account`（金融機関）を持つ。金額は入金が正・出金が負で、直せないので ref を持たない（書くツールに渡せる物を渡さない）。ルールで「共有」との立替にしたものは、立替と同じ `paidBy`・`paidFor` を持ち、精算（`expenseSettlements`）にも入る。

## ホーム

ホームのタイルには出さない（ホームのタイルの 1 枠目は天気。[weather.md](weather.md)）。精算はお金の画面で見る。お金の記録はホームのタイムライン（[home.md](home.md)）に並ぶ（`shared/timeline.ts` の `expenseEntry`）: 手で入れた立替はその日に記録したものなら記録した時刻、それ以外（後から記録した立替と取り込んだ入出金）はその日の始まりに、日付だけで置く。取り込んだ入出金の丸は当事者の色（ただの支出は無彩色）で、見出しは金融機関。
