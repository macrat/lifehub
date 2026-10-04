import { dateRangeQuerySchema } from '../../../shared/validation/common.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/**
 * 要求ごとの読み手（`service.calendarLoader`）。1 本の要求に載った calendar.get が同じ読み手を使い、
 * まとめて読まれる。コンテキストは要求ごとに 1 つなので、それを鍵にする（要求が終われば一緒に消える）
 */
const loaders = new WeakMap<object, ReturnType<typeof service.calendarLoader>>();

export const calendarRouter = router({
  /** カレンダーの 1 期間分（項目と、その期間の祝日・天気） */
  get: procedure.input(dateRangeQuerySchema).query(({ ctx, input }) => {
    const load = loaders.get(ctx) ?? service.calendarLoader();
    loaders.set(ctx, load);
    return load(input);
  }),
});
