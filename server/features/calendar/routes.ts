import { dateRangeQuerySchema } from '../../../shared/validation/common.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

export const calendarRouter = router({
  /** カレンダーの 1 期間分（項目と、その期間の祝日・天気） */
  get: procedure.input(dateRangeQuerySchema).query(({ input }) => service.getCalendar(input)),
});
