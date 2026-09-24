import { refreshHolidays } from '../server/features/holidays/service.ts';
import { refreshWeather } from '../server/features/weather/service.ts';

/**
 * 祝日と天気を配布元から取り直して `DATABASE_URL` の表に入れる。デプロイ（`deploy.yml`）と
 * ローカルの `pnpm db:seed` の後に使う。
 *
 *   pnpm data:refresh
 *
 * WHY: カレンダーの読み取り（`/api/calendar`）は手元の表を読むだけで配布元へは取りに行かないので、
 * 表が空のまま（初めてのデプロイ・作り直した DB）だと、次の Cron（祝日は月次）まで何も出ない。
 * 片方が失敗してももう片方は入れ、失敗があれば終了コード 1 で知らせる。
 * 取り直しは何度やっても同じ結果になる（祝日は全行の入れ替え、天気は日ごとの上書き）。
 */
const results = await Promise.allSettled([
  refreshHolidays().then((dates) => `holidays: ${dates.length} 日`),
  refreshWeather().then((rows) => `weather: ${rows.length} 日`),
]);
for (const result of results) {
  if (result.status === 'fulfilled') console.log(result.value);
  else console.error(result.reason);
}
process.exit(results.every((result) => result.status === 'fulfilled') ? 0 : 1);
