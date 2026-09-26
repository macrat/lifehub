import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { refreshHolidays } from './features/holidays/service.ts';
import { enqueueTomorrow } from './features/notifications/service.ts';
import { recordObservedTemps, refreshWeather } from './features/weather/service.ts';
import type { AppEnv } from './lib/app-env.ts';
import { env } from './lib/env.ts';

/**
 * Vercel Cron（`vercel.json` の `crons`）が呼ぶ入口をすべてここに集める。
 * セッションではなく Cron secret（Vercel は `CRON_SECRET` を Bearer トークンとして送る）で保護する。
 * 検査はこの集まり全体に 1 度だけ掛けるので、Cron を足しても保護を付け忘れることがない。
 * server/app.ts で認証ミドルウェアより前に `/cron` へ登録する。
 */
export const cronRoutes = new Hono<AppEnv>()
  .use(async (c, next) => {
    if (!env.CRON_SECRET || c.req.header('authorization') !== `Bearer ${env.CRON_SECRET}`) {
      throw new HTTPException(401, { message: 'unauthorized' });
    }
    await next();
  })
  // 日次: 翌日分の通知を予約する（docs/features/notifications.md）
  .get('/notifications', async (c) => c.json(await enqueueTomorrow()))
  // 月次: 祝日を配布元から取り直す（docs/features/calendar.md の「祝日」）
  .get('/holidays', async (c) => c.json({ count: (await refreshHolidays()).length }))
  // 1 日 3 回（気象庁の予報の更新の後）: 天気を気象庁から取り直す（docs/features/calendar.md の「天気」）
  .get('/weather', async (c) => c.json(await refreshWeather()))
  // 日次（朝の天気の取り直しと同じ時）: 昨日の最高・最低気温を観測値で上書きする（docs/features/calendar.md の「天気」）
  .get('/weather/observed', async (c) => c.json({ row: (await recordObservedTemps()) ?? null }));
