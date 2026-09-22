import { z } from 'zod';

/**
 * カレンダーの ics 配信 URL（[docs/features/calendar-feeds.md](../../docs/features/calendar-feeds.md)）。
 * 発行時に決められるのは名前だけで、トークンはサーバーが作る。
 */
export const createCalendarFeedSchema = z.object({
  /** 渡した先を見分けて個別に失効させるための名前 */
  name: z.string().trim().min(1, '名前を入力してください').max(50),
});
export type CreateCalendarFeedInput = z.infer<typeof createCalendarFeedSchema>;
