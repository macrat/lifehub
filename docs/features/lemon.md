# レモンの木の世話記録（lemon）

## 目的

レモンの木 1 本の世話を記録し、項目ごとに最終実施日からの経過日数を表示する。

1 回の記録には項目をいくつでも結び付ける。葉水と水やりは大抵まとめてやり、その過程で開花や落果に気づくので、1 回の世話を項目ごとの記録に割らずに 1 件へまとめる。項目を 1 つも結び付けない記録はメモそのもの（本文だけが残る）。

## 画面

- レモン `/lemon?q=&kind=項目&since=YYYY-MM-DD&until=YYYY-MM-DD`: 項目ごとの最終実施日と経過日数（葉水・水やり・施肥・開花・落果・収穫。名前の左にその項目のアイコンを出し、記録の一覧の凡例を兼ねる）、記録の追加、履歴（上が古く下が新しい）。履歴は無限スクロールで、最初は一番下（最新）を出し、上の端へ近づくと古いほうのページをサーバーから読み足す（`src/features/lemon/queries.ts` の `useCareLogHistory`、`src/lib/history.ts`、`src/lib/ui/InfiniteScroll.tsx`）。記録は増え続けるので全件は取らず、新しいほうから 1 ページ（50 件ほど）ずつ取る。絞り込みのフォームと状況のタイルは一覧の上に貼り付き、スクロールしても隠れない。絞り込みを変えると一番下へ戻る。行を単押しすると詳細が開き、長押しするとその詳細が入力欄で開く（アプリ全体の「単押しは閲覧、長押しは編集」。[architecture.md](../architecture.md)）。状況のタイルをタップするとその項目にチェックを入れた状態で記録フォームが開く（右下の追加ボタンは葉水。いちばん高頻度にやる項目で、`CareLogForm` の `DEFAULT_CARE_TYPES`）。AppBar の検索窓に入れたキーワードでメモを絞り込み（キーワードは検索パラメータ `q`、大文字小文字を区別しない部分一致、`src/lib/search.ts`）、その右の絞り込みボタンで詳細な検索（後述）を AppBar の下に開く。手元にあるのは読んだページだけなので、絞り込みはサーバーが掛ける（条件は `shared/validation/lemon.ts` の `careLogFilterSchema` で、URL と API が同じ規則を使う）。絞り込みを変えたら、取り直せるまで前の結果を出したままにする。状況のタイルは絞り込みに関わらず最新の実施日を示す。`add=lemon` は追加ボタンと同じ既定の項目で入力を開いて始めるしるし（[architecture.md](../architecture.md#pwa)）。
- 詳細な検索（`src/features/lemon/components/CareLogFilterForm.tsx`、条件は `shared/validation/lemon.ts` の `careLogFilterSchema`、判定はサーバーの `server/features/lemon/repository.ts`）: 種別（`kind`）と実施日の範囲（`since` / `until`）。種別に選んだ項目を含む記録が残る（1 件が複数の項目を持つため）。記録が持つのは瞬間（`doneAt`）なので、JST の暦日にしてから範囲と比べる。範囲は両端を含み、省略した端は制限しない。「検索」ボタンは無く、入力するたびに絞り込む。絞り込みは URL に持つので再読み込みや共有で戻り、選んでいない条件は URL に残さない。効いている条件の数は絞り込みボタンのバッジに出る（範囲は上下で 1 つ）。立替と同じ絞り込みボタン・フォーム（`src/lib/ui/FilterButton.tsx` / `FilterPanel.tsx`）を使う。
- 記録の一覧（`src/features/lemon/components/CareLogList.tsx`）: 1 行が 1 回の記録で、左から日付・やったこと・メモを横に並べる。やったことは項目 6 つ分の枠（`src/features/lemon/care-type-icons.tsx` のアイコン）で、やっていない枠も残すので、行をまたいで同じ項目が同じ位置に来て、縦に眺めるだけで「いつ何をしたか」の並びが読める。やっていない枠には 2px の薄い点を置く（ほとんどの記録は葉水か水やりだけで、空けたままだと枠が穴に見えるため。アイコンと読み違えない大きさに留める）。アイコンの意味は同じ画面の上にある状況のタイル（名前の左に同じアイコンが出る）が示すので、一覧の外に凡例は置かない。行は grid で、日付・やったこと・メモの 3 列と、やったことの中の 6 枠が同じ `columnGap` を使うので、どこを見ても隙間が同じ幅になる。日付は桁を揃えて出す（`formatDatePadded`。`9/2(水)` と `12/31(水)` のままだと中身の幅で決まる列の右端が行ごとに動き、隙間もアイコンの位置もずれる）。時刻とメモの全文は行を押して開く詳細に置く（1 行に全部載せると、いちばん読みたいメモが真っ先に切り詰められるため）。
- 記録の詳細（`src/features/lemon/components/CareLogDetailSheet.tsx`）: 項目・日時・メモ（全文）を表示し、鉛筆で同じ入れ物の中が入力欄に変わる（行を長押しで開いたときは最初から入力欄。`initialEditing`）。見出しは結び付いた項目の名前（1 つも無ければ「メモ」）。削除は三点リーダーの中。一覧に操作ボタンは置かない（行が主役で、操作は詳細に集める。立替・予定と同じ流れ）。
- 記録の項目（`src/features/lemon/components/CareLogFields.tsx`）: やったこと（チェックボックス）、日時（既定は今）、メモ（やったことが 1 つも無ければ必須）。チェックボックスは 3 列に並べるので、上段が世話（葉水・水やり・施肥）、下段が木の様子（開花・落果・収穫）になり、状況のタイルと同じ並びになる。追加（`CareLogForm`。ホームのクイック追加でも使う）と詳細からの編集で共通で、組み立てと検証は `use-care-log-form.ts` に置く。入れ物は `RecordSheet`（スマホでは下から出るシート、PC では中央のダイアログ。[architecture.md](../architecture.md)）。項目が 3 つだけなのでスマホでは画面の下半分に収まり、入力欄も保存も指の届くところに集まる。

## データ

`lemon_care_logs`（[data-model.md](../data-model.md)）。項目は `mist` / `water` / `fertilize` / `bloom` / `drop` / `harvest` の配列（`care_types`）で、空なら項目に結び付かない記録（メモ）。並びは保存時に `CARE_TYPES` の順へ正規化し、重複は落とす（`normalizeCareTypes`。入力の順でぶれると一覧の見た目が揃わない）。綴りと「空なら本文必須」は Zod だけでなく CHECK 制約でも守る（予定と同じく、DB に入れられない形は DB にも書けないようにする）。対象はレモンの木 1 本に固定し、複数植物への拡張は必要になった時点で `plants` テーブルと `plant_id` を追加して行う。

## API（`server/features/lemon/routes.ts`）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/lemon/status` | 項目ごとの最終実施日時と経過日数（`shared/validation/lemon.ts` の `CARE_TYPES` の 6 項目） |
| GET | `/api/lemon/logs?before=YYYY-MM-DD&q=&kind=&since=&until=` | 履歴の 1 ページ（`{ items, nextCursor }`。items は古い順）。新しいほうから 50 件ほどで、実施日時の JST の暦日の途中では切らない（件数は 50 を超えうる）。`nextCursor` はさらに前があるときの次の `before`。絞り込みは画面と同じ |
| POST | `/api/lemon/logs` | 記録を追加。`id` を指定するとその ID で作る（同じ ID の再送は二重に作らない） |
| PUT | `/api/lemon/logs/:id` | 編集。全項目を置き換える（入力は追加と同じ形） |
| DELETE | `/api/lemon/logs/:id` | 記録を削除 |

入力スキーマは `shared/validation/lemon.ts`。状態（最終実施日時と経過日数）の導き方は `shared/lemon.ts` の `careStatusesOf` 1 箇所に置き、サーバー（`getStatus`）とクライアントの楽観的更新が同じものを使う。楽観的更新は、追加なら記録 1 件でタイルを進め、編集・削除なら読んだ記録から導き直す。読んだページは新しいほうから途切れずに続くので、そこに記録がある項目の最新は本当の最新になる。そこに記録が無い項目は、全部読み終えていない限り再取得を待つ。サーバーは `care_types` を `unnest` で 1 項目 1 行にほどいてから項目ごとの最新の記録だけを SQL で読んで渡すので、記録が増えても状態の応答は変わらない。

## MCP ツール

`lemon_get_status`, `lemon_log_care`（[mcp.md](mcp.md)）。

## ホームのカード

「レモン」: 葉水・水やりそれぞれの最終実施日からの経過日数。レモンページと同じ `lemonStatusQueryOptions` を読む（`src/features/dashboard/cards/LemonCard.tsx`）。タイルをタップするとレモンページと同じくその項目にチェックを入れた状態で記録フォームが開く。どちらの画面も同じ `CareStatusGrid` を出すので、行き来するときは同じ項目のタイルがその場から動き、片方にしかない項目はフェードする（View Transition。名前は `care-<項目>`）。
