import { timelineQuerySchema } from '../../../shared/validation/timeline.ts';
import { router, userProcedure } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** ホームのタイムラインの 1 ページ（絞り込み q・期間 since/until・自分以外のタスク includeOthersTasks・続きの before） */
export const timelineRouter = router({
  get: userProcedure
    .input(timelineQuerySchema)
    .query(({ ctx, input }) => service.getTimelinePage(input, ctx.userId)),
});
