import { Hono } from 'hono';
import { calendarFeedSchema } from '../../../shared/validation/calendar-feeds.ts';
import { idParamSchema, withId } from '../../../shared/validation/common.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/**
 * 配信 URL の管理。ログイン中のユーザー自身の URL だけを扱う。
 * 発行した URL は、画面は書き込み後に取り直す一覧から読む（発行の応答も何も返さない）。
 */
export const calendarFeedsRouter = router({
  list: procedure.query(async ({ ctx }) => service.listFeeds(ctx.userId)),
  create: procedure.input(calendarFeedSchema).mutation(async ({ ctx, input }) => {
    await service.createFeed(input, ctx.userId);
  }),
  update: procedure
    .input(withId(calendarFeedSchema))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.updateFeed(id, input, ctx.userId);
    }),
  revoke: procedure.input(idParamSchema).mutation(async ({ ctx, input }) => {
    await service.revokeFeed(input.id, ctx.userId);
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
