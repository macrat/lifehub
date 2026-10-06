# お金（money）

## 目的

Money Forward ME に登録した銀行口座・証券口座・クレジットカードの今の値（残高・評価額・次回の引き落とし）と入出金を日に 1 度取り込み、家の記録と同じ所（お金の画面とホームのタイムライン）で眺める。立替（[expenses.md](expenses.md)）と並べて、家のお金を 1 つの画面にまとめる。

取り込んだものは読むだけで、LifeHub からは書き換えない（直すのは Money Forward で。次の取り込みで反映される）。

## 画面

- お金 `/money?q=&min=&max=&since=YYYY-MM-DD&until=YYYY-MM-DD&to=&from=&add=expense`（`src/routes/_authenticated/money.tsx`。下部ナビの「お金」。絵は `src/features/money/icon.ts` の `MoneyIcon`）。上から口座のタイル、精算のタイル、立替と入出金を 1 本に並べた一覧。タイルと絞り込みのフォームは、ホームのタイルと同じく下へスクロールすると AppBar の裏へ隠れる（絞り込みのフォームを開いている間は隠さない）。右下の追加ボタンは立替の追加。
  - 検索窓は「記録を検索」（入出金にも掛かるので）、一覧が空のときは「記録がありません」（絞り込んでいれば「一致する記録はありません」）。
  - 立替の行・精算のタイル・立替の詳細と入力・検索窓と詳細な検索は、立替だけの一覧だったときのまま（[expenses.md](expenses.md#画面)）。検索パラメータも立替の物（`src/features/expenses/search.ts` の `expenseSearchSchema`）。
  - 絞り込みは入出金にも読み替えて掛ける（サーバーの `server/features/money/repository.ts` の `history`）: キーワードは内容の部分一致、金額の範囲は出金も入金も額の大きさ（絶対値）、日付の範囲は明細の日付。To・From は、ルールで「共有」との立替にした入出金（[取り込みルール](#取り込みルール)）の当事者に掛かる（入金は 対象者 → 共有、出金は 共有 → 対象者）。ただの支出は当事者を持たないので、To・From のどちらかで絞り込んでいれば出さない。
- 口座のタイル（`src/features/money/components/AccountGrid.tsx`）: 取り込む口座（[口座の指定](#口座の指定)）を 1 つ 1 枚、環境変数に書いた順に並べる（スマホは 3 列、PC は 4 列。スマホの 3 列でも 7 桁の金額が収まるよう、値の字はほかのタイルより小さい）。タイルはレモン・精算と同じもの（`StatusTile`）で、名前（金融機関）・値・補足の 3 段。値は銀行なら残高、証券なら評価額、クレジットカードなら次回の引き落とし額で、補足は「残高」「評価額」、カードは次回の引き落とし日（「次回 10/27」。スマホの 3 列に収まるよう曜日は付けない。日が読めなければ「次回」）。まだ取り込んでいない値や読めなかった値は「—」。押すとその口座の推移（下記）が開く。取り込む口座が無ければ（環境変数が無ければ）段ごと出さない。
- 口座の推移 `/money/balances?accounts=名前&accounts=名前`（`src/routes/_authenticated/money_.balances.tsx`。口座のタイルから開く。下部ナビには置かず、お金のタブの中の画面として扱う）: 選んだ口座の値の推移を積み上げた、塗りつぶし付きの折れ線グラフ（`src/features/money/components/BalanceChart.tsx`）。値は銀行なら残高、証券なら評価額、クレジットカードなら負債額（Money Forward の利用残高の大きさに - を付けた負の数）。負債は 0 より下へ積み、残高・評価額は 0 より上へ積む（ECharts の積み上げは正と負を別々に積む）。押したときの合計は負債を引いた額。
  - AppBar は戻るボタン・出している期間（「2026/7/6 〜 10/6」。年をまたげば両方に年）・絞り込みボタン。絞り込みでは出す口座をチェックで選ぶ（URL の accounts。タイルから開いたときは押したタイルの口座だけ。選び直しは履歴に積まないので、戻るでお金の画面へ戻る）。どれも選んでいなければ「表示する口座を選んでください」。
  - 最初は今日までの過去 3 か月を出す。ピンチ・マウスホイールで期間を拡大縮小し（最短 1 週間）、ドラッグで前後へ動かす。出している期間の始まりより、期間の長さの半分手前まで読んでいなければ古いほうの記録を読み足す（`src/features/money/use-balance-chart.ts`）ので、過去へ動かし続けられる（記録を始めた日まで）。
  - 縦軸は、出している期間の値（積み上げた値）の最小と最大から、値の幅の 1 割ずつ外へ広げてきりのよい値に丸めた範囲。値がすべて 0 以上なら下端は 0 を下回らず、すべて 0 以下（カードだけ）なら上端は 0 を上回らない（`src/features/money/balance-chart.ts` の `axisRange`）。目盛りは 1 万円以上を万で数える。
  - グラフのどこかを押す・マウスを乗せると、その日の日付と口座ごとの金額（2 つ以上なら合計も）が出る。
  - 記録の無い日（取り込めなかった日）は、その口座の前の日の値のままとして描く（積み上げは同じ日の値を足すので、日を揃える。`toSeries`）。口座の色は口座の並びで決まり、選び直しても変わらない。
  - 描画は ECharts（`echarts`。この画面のチャンクにだけ入る）。WHY ECharts: ピンチでの拡大縮小・ドラッグでの移動・押した位置の値の表示・積み上げの塗りつぶしをどれも設定だけで持ち、使う部品だけを読み込める。WHY NOT MUI X Charts: 拡大縮小が有料版の機能。
- 一覧（`src/features/money/components/MoneyList.tsx`）: 上が新しく下が古い無限スクロール（`src/features/money/queries.ts` の `moneyHistory`。最初の位置・ページ分け・貼り付くものの決まりは [ui.md](../ui.md#無限スクロール)）。日ごとに見出しを立て、その下に 1 件 1 行で並べる。行の骨組みはカレンダーのリスト表示と同じ（`DateHeading` と `MarkedRow`）で、左から印、金額、内容（上）と補足（下）。金額は桁を揃えて右寄せにし、列の幅は読んだ中で一番幅を取る金額に合わせる。
  - 立替の行は立替だけの一覧だったときのまま（[expenses.md](expenses.md#画面)）。
  - 入出金の行: 内容はルールで読み替えた後の内容欄。印は無彩色の点（取り込んだ入出金は人に結び付かない。ホームのタイムラインの丸と同じ色）で、ルールで「共有」との立替にしたものは立替と同じ並びと色のベン図。金額は入金に + を付け、符号は円記号の後ろ（「¥+50,000」「¥-3,200」。`src/lib/yen.ts` の `formatSignedYen`）、補足は金融機関。
  - 同じ日の中は、立替は記録した順、入出金は時刻を持たないのでその日の立替より下に置く（`shared/money.ts` の `sortMoneyEntries`）。
- 入出金の詳細（`src/features/money/components/TransactionDetailSheet.tsx`）: 金額・日付・金融機関。読むだけなので鉛筆も三点リーダーも出さず、行の長押しも単押しと同じく閲覧で開く。入れ物は `RecordSheet`。

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
- 書き込み: 読んだ明細の最も古い日から最も新しい日までを、Money Forward の今の明細に置き換える（同じ明細（`source_id`）は上書きし、載っていない明細は Money Forward で消されたものとして消す）。口座の値は口座ごとに上書きし、環境変数から外した口座の行と明細は消す。どれも 1 つのトランザクションで書く（`repository.ts` の `saveImport`）。
  - WHY 置き換える範囲を読んだ明細の日付で決める: Money Forward は月の始まりの日を設定で変えられ、CSV が暦の月とずれることがある。暦の月で置き換えると、CSV に載らなかった日の明細を消してしまう。
- 失敗（ログインできない、CSV ではないものが返る、形の合わない行がある）は何も書かずに投げる。前回の値が残り、Cron の失敗として Sentry に残る。形の合わない行を黙って飛ばさないのは、Money Forward の形が変わったときに明細が消えていくのに気づけなくなるため。

## 取り込みルール

取り込んだ入出金の内容欄を読み替え、入金・出金を「共有」との立替として精算に入れる。

- 画面 `/admin/money-rules`（`src/routes/_authenticated/admin.money-rules.tsx`。設定の「お金」セクションの「取り込みルール」から開く）。AppBar は戻るボタンと「取り込みルール」。
  - 一覧（`src/features/money/components/MoneyRuleList.tsx`。形は設定から開くほかの管理の画面と同じ `EditableList`）: 上から当てる順に並べ、行は左に当たった入出金の印（お金の画面の入出金の印と同じ。支出は無彩色の点、入金は対象者の色の円 1 つ、出金は左に対象者・右に無彩色の円。`rule-text.ts` の `ruleParties`）、パターンと説明（「「$1 さん」に置換・入金 太郎・一覧に表示しない」。`describeRule`）、右端の鉛筆。行を長押しして引くと並べ替える（`@dnd-kit`。キーボードでも動かせる）。WHY 長押し: 取っ手を置かずに行の形をほかの管理の画面と揃え、短く押して指を動かしたときは画面のスクロールに譲る。
  - 追加は右下の追加ボタン（「ルールを追加」。末尾に足す）、変更は鉛筆で、どちらも同じシート（`MoneyRuleSheet`。状態と保存は `use-money-rule-form.ts`）を開く。シートは上から、パターン（正規表現）、「内容欄を置換」のスイッチと置換後の内容欄（スイッチがオフなら入力できない）、種別（支出・入金・出金）と対象者（支出なら選べない。入金・出金に変えると自分が入る）、「一覧に表示しない」のスイッチ。削除はシートの三点リーダー。ルールはいくつでも持てる（上限 100）。
  - 正しくない（パターンが空か正規表現として読めない、置換するのに置換後が空、入金・出金なのに対象者が無い）ときは、欄に誤りを出して保存しない。保存・並べ替え・削除のたびに並び全体を保存する（`src/features/money/use-money-rules.ts`。保存のたびに過去の入出金を読み替え直す）。
- 当て方（`server/features/money/rules.ts` の `applyRules`）: Money Forward の内容欄そのままに、上から順にパターン（JavaScript の正規表現）を当て、最初に当たったルールだけを使う。パターンは内容欄全体と一致したときだけ当たる（`^(?:パターン)$` と同じ。`shared/money.ts` の `fullMatch`。`a|b` のような選択も全体に掛かる）。WHY 完全一致: 部分一致だと、短いパターンが思わぬ内容欄にも当たり、上から順に見るので後ろのルールを黙って隠す。一部だけで見分けたいときは `.*` を書く。どれにも当たらなければ元のまま（ただの支出）。
  - 置換は内容欄全体を置換後の内容欄にする。置換後の内容欄には `String.prototype.replace` と同じ書き方で、キャプチャ（`$1`、名前付きは `$<名前>`）・当たった所全体（`$&`）・`$` そのもの（`$$`）を差し込める。WHY 当たった部分だけでなく全体: 長い内容欄を短い名前にしたいとき、当たった部分だけを置き換えると残りが付いてくる。
  - 入金（対象者が共有口座へ入れた）は「対象者 → 共有」、出金（対象者が共有口座から引き出した）は「共有 → 対象者」の立替と同じに精算へ入る（立替の [計算ルール](expenses.md#計算ルール)。額は出金も入金も大きさ）。お金の画面の印とタイムラインの丸もその当事者の色になる。
  - 「一覧に表示しない」をオンにしたルールに当たった入出金は、お金の画面の一覧・ホームのタイムライン（MCP の `read_timeline` も同じ問い合わせ）に出さない。種別と対象者はほかのルールと同じに効き、入金・出金なら精算には入る。WHY 精算から外さない: 表示のスイッチで精算の額まで変わると、見えない所で残高が動く。精算から外したいなら種別を支出にする。
- 過去の入出金にも効く: 取り込んだ入出金は元の内容欄（`original_description`）と読み替えた後（`description`・`direction`・`user_id`・`hidden`）の両方を持ち、ルールを保存するたびにすべての入出金を元の内容欄から読み替え直す（`server/features/money/service.ts` の `saveRules`。ルールの置き換えと読み替えは 1 つのトランザクション）。取り込み直さずに済む。

## データ

`money_accounts`・`money_balances`・`money_transactions`・`money_rules`（[data-model.md](../data-model.md)）。

- `money_rules`: 取り込みルール（`position` の順）。`pattern`、`replace_description`、`replacement`、`kind`（`spending` / `deposit` / `withdrawal`）、`user_id`（支出なら null。CHECK 制約）、`hidden`（一覧に表示しない）。家族で 1 つの並びで、保存は並び全体の置き換え。
- `money_accounts`: 口座の名前ごとの今の値（残高・評価額 `balance`、カードの引き落とし `withdrawal_amount`・`withdrawal_on`、取り込んだ日時 `fetched_at`）。読めなかった値は null。
- `money_balances`: 口座の値の日ごとの記録（`account` と `recorded_on` が主キー）。`balance` は銀行なら残高、証券なら評価額、カードなら負債額を負の数で持つ（取り込みのときに向きを揃える。`server/features/money/service.ts` の `syncMoneyForward`）。環境変数から外した口座の行は次の取り込みで消す。
- `money_transactions`: 入出金 1 件。`amount` は入金が正・出金が負の円。`original_description` は Money Forward の内容欄そのまま、`description` はルールで読み替えた後。`direction`（`deposit` / `withdrawal`）と `user_id` はルールで「共有」との立替にしたときの向きと対象者で、組でしか持てない（CHECK 制約）。`hidden` はルールで一覧に出さないとしたもの。Money Forward の分類（大項目・中項目）は取り込まない（Money Forward の自動の分類は正しいとは限らず、LifeHub からは直せないので、出しても頼れない）。`source_id` は Money Forward の明細の ID（一意）。

## API（`server/features/money/routes.ts`）

| 手続き | 種類 | 内容 |
|---|---|---|
| `money.accounts` | 読み出し | 口座のタイル（`[{ name, kind, balance, withdrawalAmount, withdrawalOn, fetchedAt }]`）。環境変数に書いた順で、まだ取り込んでいない口座も値を null にして並べる |
| `money.balances` | 読み出し | 口座の値の推移の 1 ページ（入力 `{ before? }`。`{ items: [{ account, on, amount }], nextCursor }`）。before（省けば明日）より前の 3 か月の記録を日の古い順に、今取り込んでいる口座すべての分。nextCursor はそのページの始まりの日で、それより前の記録が無ければ null。WHY 件数ではなく期間で区切る: グラフは期間で見るもので、最初に出す 3 か月が 1 回の取得で揃う |
| `money.rules` | 読み出し | 取り込みルールの並び（上から順。`[{ id, pattern, replaceDescription, replacement, kind, userId }]`） |
| `money.saveRules` | 書き込み | ルールの並び全体を置き換え（入力は `shared/validation/money.ts` の `moneyRulesSchema`）、取り込み済みの入出金を読み替え直す。値は返さない |

お金の画面の一覧は、立替と 1 本に並べた `expenses.list`（[expenses.md](expenses.md) の「API」。精算と同じく、立替の側が入出金を読む）。入出金を書く手続きは無い（取り込みは Cron だけが行う）。

## MCP ツール

専用のツールは無い。入出金は `read_timeline` のエントリー（`type: "transaction"`。`types` で絞れる）、口座の今の値は `get_overview` の `moneyAccounts` で読む（[mcp.md](mcp.md)）。ルールで「共有」との立替にした入出金は、立替と同じ `paidBy`・`paidFor` を持ち、精算（`expenseSettlements`）にも入る。直せないので、入出金のエントリーは ref を持たない（書くツールに渡せる物を渡さない。`server/lib/mcp/refs.ts` は ref を持つ種類と読める種類を分けて持つ）。

## ホーム

ホームのタイルには出さない。入出金はホームのタイムライン（[home.md](home.md)）に、日付の始まり（日付だけ）で並ぶ（`shared/timeline.ts` の `transactionEntry`）。
