import { dateRangeQuerySchema } from '../../../shared/validation/common.ts';
import { perRequest, procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** 要求ごとの読み手。1 本の要求に載った calendar.get がまとめて読まれる */
const loaderOf = perRequest(service.calendarLoader);

export const calendarRouter = router({
  /** カレンダーの 1 期間分（項目と、その期間の祝日・天気） */
  get: procedure.input(dateRangeQuerySchema).query(({ ctx, input }) => loaderOf(ctx).load(input)),
});
