import { timelineQuerySchema } from '../../../shared/validation/timeline.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** ホームのタイムラインの 1 ページ（絞り込み q・期間 since/until・続きの before） */
export const timelineRouter = router({
  get: procedure.input(timelineQuerySchema).query(({ input }) => service.getTimelinePage(input)),
});
