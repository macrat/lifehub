import { z } from 'zod';
import { nameSchema, participantIdsSchema } from './common.ts';

/**
 * カレンダーの ics 配信 URL（[docs/features/calendar-feeds.md](../../docs/features/calendar-feeds.md)）。
 * 決められるのは名前と、表示する対象者だけ。トークンはサーバーが作る。
 * 発行と変更で決められることは同じなので、スキーマも 1 つで足りる。
 */
export const calendarFeedSchema = z.object({
  /** 渡した先を見分けて個別に失効させるための名前 */
  name: nameSchema,
  /**
   * この URL に表示する対象者。この中の誰かが入っている予定だけを配る。
   * 1 人以上（0 人では何も配らず、持っていても意味が無い）。
   */
  participantIds: participantIdsSchema,
});
export type CalendarFeedInput = z.infer<typeof calendarFeedSchema>;
