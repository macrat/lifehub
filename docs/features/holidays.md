# 祝日（holidays）

## 目的

日本の祝日（振替休日・国民の休日を含む）を配布元から取っておき、日付の色分けに使う。専用の画面も API も持たず、祝日を出す画面の問い合わせに相乗りして配る。

## 画面

祝日の日付の数字を、日曜と同じ赤で出す。それ以外（見出し・項目）は変えない。色の規則は `src/lib/date.ts` の `dateColor`。

- 予定画面（[calendar.md](calendar.md)）: 月・週・日の表示と年月の選択の日付の数字（`DayNumber`）。
- 天気の画面（[weather.md](weather.md)）: 各日の行の日付。

まだ届いていない月や表に無い日は、どの日も祝日でない扱いで出す。

## 取得と保存（`server/features/holidays/`）

- 出所は webcal.jp の ics（`https://one.webcal.jp/JapanHolidays/`）。法令・官報に基づいて数年先まで確定した分が載っている。
  - WHY NOT 祝日の規則を自前で持つ: 春分・秋分の日が官報で決まり、法改正や特例での移動もあって追い続ける必要がある。
- 月に 1 回（Vercel Cron、毎月 1 日 15:00 UTC = 2 日 0:00 JST）`GET /api/cron/holidays`（`server/cron.ts`。Cron secret で保護）で取り直し、`holidays` テーブルの全行を入れ替える。
- 配布元は毎年の祝日を RRULE と EXDATE で書いているので、解析と展開は `ical.js` に任せる。
- 取得・解析に失敗したら何も書かず、前回の一覧が残る。
- 表を埋めるのは Cron とデプロイだけで、読むときには配布元へ取りに行かない。他人のサイトを、利用者の操作の速さと可用性に巻き込まないため。
- 表が空のまま（初めてのデプロイ・作り直した DB）だと月次の Cron まで祝日が出ないので、デプロイのたびに `pnpm data:refresh`（`scripts/refresh-calendar-data.ts`。祝日と天気を取り直す）を実行する（`deploy.yml`。配布元が落ちていてもデプロイは止めない）。ローカルは `pnpm db:seed` の後に同じものが走る。

## データ

`holidays`（[data-model.md](../data-model.md)）。使うのは日付だけなので名前は持たない。

## API

祝日だけを返す API は持たない。祝日を出す画面が読む問い合わせに、その範囲の祝日を載せる。

- 予定画面: `GET /api/calendar` の `holidays`（[calendar.md](calendar.md#api)）。面（`CalendarPane`）が月のキャッシュから読んで月の週の行・週／日の見出しへ渡し、年月の選択（`DatePickerDialog`）は選んでいる月の月グリッドの範囲を読む（選んだ先の月の項目を先に読んでおくことにもなる）。集合を引くのは読む側で、`DayNumber` は `holiday` を受け取って色を決めるだけ（日ごとに購読させない）。
- 天気の画面: `GET /api/weather` の各日の `holiday`（[weather.md](weather.md#apiserverfeaturesweatherroutests)）。

## MCP ツール

無し。`read_timeline` の各日に祝日かどうかが付く（[mcp.md](mcp.md)）。
