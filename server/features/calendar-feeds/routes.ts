import { Hono } from 'hono';
import { calendarFeedSchema } from '../../../shared/validation/calendar-feeds.ts';
import { idParamSchema } from '../../../shared/validation/common.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validate } from '../../lib/validator.ts';
import * as service from './service.ts';

/**
 * 配信 URL の管理（`/api/calendar/feeds`）。ログイン中のユーザー自身の URL だけを扱う。
 * 発行した URL は、画面は書き込み後に取り直す一覧から読む（発行の応答も本文を返さない）。
 */
export const calendarFeedsRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await service.listFeeds(c.get('user').id)))
  .post('/', validate('json', calendarFeedSchema), async (c) => {
    await service.createFeed(c.req.valid('json'), c.get('user').id);
    return c.body(null, 204);
  })
  .patch(
    '/:id',
    validate('param', idParamSchema),
    validate('json', calendarFeedSchema),
    async (c) => {
      await service.updateFeed(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  )
  .delete('/:id', validate('param', idParamSchema), async (c) => {
    await service.revokeFeed(c.req.valid('param').id, c.get('user').id);
    return c.body(null, 204);
  });

/**
 * ics の配信（`/api/calendar/<token>.ics`）。認証は無く、URL のトークンを知っていることだけが
 * 資格になる（カレンダーを購読するアプリはログインの Cookie を送れない）。
 * `.ics` で終わるパスしか受けないので、同じ `/api/calendar` の下の `feeds`（上記）とは衝突しない。
 */
export const calendarIcsRoutes = new Hono<AppEnv>().get('/:file{[\\w-]+\\.ics}', async (c) => {
  const token = c.req.param('file').slice(0, -'.ics'.length);
  return c.body(await service.renderIcs(token), 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    // 内容は今日を軸に毎日変わる。共有キャッシュには置かせない
    'Cache-Control': 'private, no-cache',
  });
});
