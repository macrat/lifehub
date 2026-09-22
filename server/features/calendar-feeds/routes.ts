import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { calendarFeedSchema } from '../../../shared/validation/calendar-feeds.ts';
import { uuidSchema } from '../../../shared/validation/common.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

const idParam = z.object({ id: uuidSchema });

/** 配信 URL の管理（`/api/calendar/feeds`）。ログイン中のユーザー自身の URL だけを扱う */
export const calendarFeedsRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await service.listFeeds(c.get('user').id)))
  .post('/', zValidator('json', calendarFeedSchema, validationHook), async (c) => {
    const feed = await service.createFeed(c.req.valid('json'), c.get('user').id);
    return c.json(feed, 201);
  })
  .patch(
    '/:id',
    zValidator('param', idParam, validationHook),
    zValidator('json', calendarFeedSchema, validationHook),
    async (c) => {
      // 変わるのは送った名前と参加者だけ（URL は変わらない）ので、応答の本文は要らない
      await service.updateFeed(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  )
  .delete('/:id', zValidator('param', idParam, validationHook), async (c) => {
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
