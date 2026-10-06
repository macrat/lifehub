# お金（money）

## 目的

Money Forward ME に登録した銀行口座・証券口座・クレジットカードの今の値（残高・評価額・次回の引き落とし）と入出金を日に 1 度取り込み、家の記録と同じ所（お金の画面とホームのタイムライン）で眺める。立替（[expenses.md](expenses.md)）と並べて、家のお金を 1 つの画面にまとめる。

取り込んだものは読むだけで、LifeHub からは書き換えない（直すのは Money Forward で。次の取り込みで反映される）。

## 画面

- お金 `/money?view=transactions&q=&since=YYYY-MM-DD&until=YYYY-MM-DD&account=金融機関&min=&max=&to=&from=&add=expense`（`src/routes/_authenticated/money.tsx`。下部ナビの「お金」。絵は `src/features/money/icon.ts` の `MoneyIcon`）。上から口座のタイル、精算のタイル（立替の一覧のときだけ）、一覧のタブ（「立替」「入出金」）、一覧。タイル・タブと絞り込みのフォームは、ホームのタイルと同じく下へスクロールすると AppBar の裏へ隠れる（絞り込みのフォームを開いている間は隠さない）。右下の追加ボタンは立替の追加。
  - 一覧は `view` で切り替える。既定（`view` なし）は立替で、追加ボタンで足した立替がそのまま見える。`view=transactions` は入出金。
  - 検索パラメータは `src/features/money/search.ts` の `moneySearchSchema`。キーワード（`q`）と日付の範囲（`since` / `until`）は両方の一覧で同じものを使うので、タブを切り替えても絞り込みが続く。金額・To・From（`min` / `max` / `to` / `from`）は立替だけ、金融機関（`account`）は入出金だけに効く。絞り込みボタンのバッジは出している一覧の条件だけを数える（`MONEY_FILTER_CONDITIONS`）。
  - 立替の一覧・精算のタイル・立替の詳細と入力は [expenses.md](expenses.md#画面)。
- 口座のタイル（`src/features/money/components/AccountGrid.tsx`）: 取り込む口座（[口座の指定](#口座の指定)）を 1 つ 1 枚、環境変数に書いた順に並べる（スマホは 2 列、PC は 4 列）。タイルはレモン・精算と同じもの（`StatusTile`）で、名前（金融機関）・値・補足の 3 段。値は銀行なら残高、証券なら評価額、クレジットカードなら次回の引き落とし額で、補足は「残高」「評価額」、カードは引き落とし日（「10/27(火) 引き落とし」。日が読めなければ「次回の引き落とし」）。まだ取り込んでいない値や読めなかった値は「—」。押すと、その金融機関で絞り込んだ入出金の一覧を開く。取り込む口座が無ければ（環境変数が無ければ）段ごと出さない。
- 入出金の一覧（`src/features/money/components/TransactionList.tsx`）: 立替の一覧と同じ骨組み（日ごとの見出しと `MarkedRow`）で、上が新しく下が古い無限スクロール（`src/features/money/queries.ts` の `transactionHistory`）。行は左から印、金額、内容（上）と「金融機関・分類」（下）。印は無彩色の点（取り込んだ入出金は人に結び付かない。ホームのタイムラインの丸と同じ色）。金額は入金に + を付け（`src/lib/yen.ts` の `formatSignedYen`）、桁を揃えて右寄せにする。AppBar の検索窓は「入出金を検索」で、内容と分類に部分一致で掛かる。絞り込みはサーバーが掛ける（条件は `shared/validation/money.ts` の `transactionFilterSchema`）。
- 詳細な検索（`src/features/money/components/TransactionFilterForm.tsx`）: 日付の範囲と金融機関。フォームの振る舞いは [ui.md](../ui.md#appbar-と検索)。
- 入出金の詳細（`src/features/money/components/TransactionDetailSheet.tsx`）: 金額・日付・金融機関と分類。読むだけなので鉛筆も三点リーダーも出さず、行の長押しも単押しと同じく閲覧で開く。入れ物は `RecordSheet`。

## 口座の指定

- 取り込む口座はサーバーの環境変数 `MONEYFORWARD_ACCOUNTS` で決める（`server/lib/env.ts` の `moneyAccountsSchema`）。`種類:名前` をカンマで区切って並べ（`bank:三井住友銀行,securities:SBI証券,card:楽天カード`）、並べた順がタイルの順になる。
  - 種類は `bank`（銀行。残高）・`securities`（証券。評価額）・`card`（クレジットカード。次回の引き落とし）。`shared/money.ts` の `MONEY_ACCOUNT_KINDS`。
  - WHY 種類を書かせる: タイルに出す値が種類で決まり、Money Forward の画面から種類を読み取るより、書いてもらうほうが確か。
  - 名前は Money Forward の口座一覧に出る金融機関の名前。画面や CSV の名前は前方一致で引き当て、いくつも合えば一番長い名前にする（`server/features/money/parse.ts` の `matchAccount`。口座の種別が後ろに付いても引き当てられ、「楽天カード」と「楽天カード（家族）」を取り違えない）。
  - 書き方が違えば（種類が無い・名前が重なる）サーバーは起動しない。
- 環境変数から外した口座は、残っている行も画面・タイムライン・MCP に出さない（`service.ts` が今の口座の名前で絞る）。
- ログインには `MONEYFORWARD_EMAIL`・`MONEYFORWARD_PASSWORD` を使う。Money Forward ID で 2 段階認証（認証アプリ）を使っているなら、その秘密鍵を `MONEYFORWARD_TOTP_SECRET` に渡す（`otpauth` でコードを作って答える）。本番ではログインの 2 つと口座が欠けていれば起動しない（`PRODUCTION_REQUIRED`。欠けたままだと取り込みが何もせずに正常終了し、気づけないため）。値の置き場所は [operations.md](../operations.md#terraforminfra)。

## 取り込み

- 日に 1 度、朝 7:00（JST）の Cron（`/api/cron/money`。`vercel.json`）が `server/features/money/service.ts` の `syncMoneyForward` を呼ぶ。
- Money Forward ME には個人で使える API が無いので、人が使うのと同じ画面をブラウザ（Playwright）で開いて読む（`server/features/money/moneyforward.ts`）。画面の作りに頼る所はこのファイルにまとめ、読んだ文字の読み方は `parse.ts` に置く（ブラウザ無しでテストできる）。
  - ログイン: ME の `/sign_in` から Money Forward ID を経て戻ってくる。途中の画面（メール、パスワード、2 段階認証、アカウントの選択、パスキーの案内）は出たり出なかったりし順も決まっていないので、ME に戻るまで今出ている画面を見て 1 つずつ進める。メールの確認コードを求められたら答えられないので、2 段階認証（認証アプリ）を設定するよう言って失敗する。
  - 入出金: 家計簿の CSV ダウンロード（`/cf/csv`。Money Forward の**有料プラン**の機能）を先月と今月の 2 か月分読み、Shift_JIS を文字に直して見出しの名前で列を引く。WHY CSV: 画面の表を読むより見た目の変更に左右されず、明細の ID（同じ明細を 2 度入れないための鍵）も載っている。WHY 先月も: カードの明細は使った日から数日遅れて届くので、月の初めに読むと先月の終わりの明細がまだ増える。
  - 口座の値: 残高・評価額は口座一覧（`/accounts`）の金額の列、カードの引き落とし額はカードの詳細の見出し「引き落とし予定額：…」（「未定」なら読めない値。カードごとにタブを開いて並べて読む）、引き落とし日はトップの口座の並びの「引き落とし日:(…)」。読むのは文字だけなので、画像・フォント・動画は読み込まず、ページは文書ができた所で読む。
  - Vercel の関数には Chromium が無いので、AWS Lambda 向けに縮めた Chromium（`@sparticuz/chromium-min`）を取り込みのたびに配布元から展開して使う。WHY NOT 本体を同梱する `@sparticuz/chromium`: 全 API が 1 つの関数なので、1 日 1 回しか使わない 60MB をどの要求のコールドスタートにも背負わせることになる。同じ理由で、ブラウザ・CSV・2 段階認証の部品（`moneyforward.ts`・`parse.ts`）は取り込みのときだけ読み込む。ローカルでは Playwright の Chromium を使う。
- 書き込み: 読んだ明細の最も古い日から最も新しい日までを、Money Forward の今の明細に置き換える（`repository.ts` の `replaceInRange`。同じ明細（`source_id`）は上書きし、載っていない明細は Money Forward で消されたものとして消す。1 つのトランザクション）。口座の値は口座ごとに上書きする。
  - WHY 置き換える範囲を読んだ明細の日付で決める: Money Forward は月の始まりの日を設定で変えられ、CSV が暦の月とずれることがある。暦の月で置き換えると、CSV に載らなかった日の明細を消してしまう。
- 失敗（ログインできない、CSV ではないものが返る、形の合わない行がある）は何も書かずに投げる。前回の値が残り、Cron の失敗として Sentry に残る。形の合わない行を黙って飛ばさないのは、Money Forward の形が変わったときに明細が消えていくのに気づけなくなるため。

## データ

`money_accounts`・`money_transactions`（[data-model.md](../data-model.md)）。

- `money_accounts`: 口座の名前ごとの今の値（残高・評価額 `balance`、カードの引き落とし `withdrawal_amount`・`withdrawal_on`、取り込んだ日時 `fetched_at`）。読めなかった値は null。
- `money_transactions`: 入出金 1 件。`amount` は入金が正・出金が負の円。`category` は Money Forward の分類（「大項目 / 中項目」。未分類なら null、中項目が未分類なら大項目だけ）。`source_id` は Money Forward の明細の ID（一意）。

## API（`server/features/money/routes.ts`）

| 手続き | 種類 | 内容 |
|---|---|---|
| `money.accounts` | 読み出し | 口座のタイル（`[{ name, kind, balance, withdrawalAmount, withdrawalOn, fetchedAt }]`）。環境変数に書いた順で、まだ取り込んでいない口座も値を null にして並べる |
| `money.transactions` | 読み出し | 入出金の履歴の 1 ページ（`{ items, nextCursor }`。items は古い順）。入力は続きの `before` と絞り込み（`q` / `since` / `until` / `account`）。ページの分け方は立替の履歴と同じ（[expenses.md](expenses.md) の「API」） |

書き込みの手続きは無い（取り込みは Cron だけが行う）。画面から書かないので、楽観的更新も無い。

## MCP ツール

専用のツールは無い。入出金は `read_timeline` のエントリー（`type: "transaction"`。`types` で絞れる）、口座の今の値は `get_overview` の `moneyAccounts` で読む（[mcp.md](mcp.md)）。直せないので、入出金のエントリーは ref を持たない（書くツールに渡せる物を渡さない。`server/lib/mcp/refs.ts` は ref を持つ種類と読める種類を分けて持つ）。

## ホーム

ホームのタイルには出さない。入出金はホームのタイムライン（[home.md](home.md)）に、日付の始まり（日付だけ）で並ぶ（`shared/timeline.ts` の `transactionEntry`）。
