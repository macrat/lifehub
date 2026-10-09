import { Hono } from 'hono';
import { calendarFeedSchema } from '../../../shared/validation/calendar-feeds.ts';
import { idParamSchema, withId } from '../../../shared/validation/common.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** 配信 URL の管理。ログイン中のユーザー自身の URL だけを扱う */
export const calendarFeedsRouter = router({
  list: procedure.query(async ({ ctx }) => service.listFeeds(ctx.user.id)),
  /** 発行した URL は、この応答でしか見せられないので返す */
  create: procedure
    .input(calendarFeedSchema)
    .mutation(async ({ ctx, input }) => service.createFeed(input, ctx.user.id)),
  update: procedure
    .input(withId(calendarFeedSchema))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.updateFeed(id, input, ctx.user.id);
    }),
  revoke: procedure.input(idParamSchema).mutation(async ({ ctx, input }) => {
    await service.revokeFeed(input.id, ctx.user.id);
  }),
});

/**
 * ics の配信（`/api/calendar/<token>.ics`）。認証は無く、URL のトークンを知っていることだけが
 * 資格になる（カレンダーを購読するアプリはログインの Cookie を送れない）。
 * `.ics` で終わるパスしか受けない。
 */
export const calendarIcsRoutes = new Hono().get('/:file{[\\w-]+\\.ics}', async (c) => {
  const token = c.req.param('file').slice(0, -'.ics'.length);
  return c.body(await service.renderIcs(token), 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    // 内容は今日を軸に毎日変わる。共有キャッシュには置かせない
    'Cache-Control': 'private, no-cache',
  });
});
