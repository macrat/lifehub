import { Hono, type MiddlewareHandler } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { HTTPException } from 'hono/http-exception';
import { recordScheduledExpenses } from './features/expenses/service.ts';
import { refreshHolidays } from './features/holidays/service.ts';
import { syncMoneyForward } from './features/money/service.ts';
import { enqueueTomorrow } from './features/notifications/service.ts';
import { recordObservedTemps, refreshWeather } from './features/weather/service.ts';
import { env } from './lib/env.ts';

/**
 * Cron secret の Bearer トークンの検査（比べ方は Hono 標準の bearerAuth。時間差で漏れない比較）。起動時に 1 度だけ選ぶ。
 * secret の無い環境では、どんなトークンも通さない。
 */
const verifyCronSecret: MiddlewareHandler = env.CRON_SECRET
  ? bearerAuth({ token: env.CRON_SECRET })
  : () => {
      throw new HTTPException(401, { message: 'unauthorized' });
    };

/**
 * Vercel Cron（`vercel.json` の `crons`）が呼ぶ入口をすべてここに集める。
 * セッションではなく Cron secret（Vercel は `CRON_SECRET` を Bearer トークンとして送る）で保護する。
 * 検査はこの集まり全体に 1 度だけ掛けるので、Cron を足しても保護を付け忘れることがない
 * （`/api` の下の外からの入口は、それぞれが自分を守る。docs/architecture.md の「認証・認可」）。
 */
export const cronRoutes = new Hono()
  .use(verifyCronSecret)
  // 日次: 翌日分の通知を予約する（docs/features/notifications.md）
  .get('/notifications', async (c) => c.json(await enqueueTomorrow()))
  // 日次（日付が変わってすぐ）: 立替スケジュールの、日が来た回を記録する（docs/features/expenses.md の「立替スケジュール」）
  .get('/expenses', async (c) => c.json(await recordScheduledExpenses()))
  // 月次: 祝日を配布元から取り直す（docs/features/holidays.md）
  .get('/holidays', async (c) => c.json({ count: (await refreshHolidays()).length }))
  // 1 日 3 回（気象庁の予報の更新の後）: 天気を気象庁から取り直す（docs/features/weather.md の「取得と保存」）
  .get('/weather', async (c) => c.json(await refreshWeather()))
  // 日次（朝の天気の取り直しと同じ時）: 昨日の最高・最低気温を観測値で上書きする（docs/features/weather.md の「取得と保存」）
  .get('/weather/observed', async (c) => c.json({ row: (await recordObservedTemps()) ?? null }))
  // 日次（朝）: Money Forward から口座の値と入出金を取り込む（docs/features/money.md の「取り込み」）
  .get('/money', async (c) => c.json(await syncMoneyForward()));
