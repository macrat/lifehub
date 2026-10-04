import { calendarQuerySchema } from '../../../shared/validation/calendar.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

export const calendarRouter = router({
  /** カレンダーの月ごとの中身（項目と、その月の祝日・天気）。頼んだ月をまとめて 1 回で返す */
  get: procedure.input(calendarQuerySchema).query(({ input }) => service.getCalendar(input.months)),
});
