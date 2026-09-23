import { z } from 'zod';
import { dateStringSchema } from '../../../shared/validation/common.ts';

export const viewSchema = z.enum(['month', 'week', 'day', 'list']);
/** 表示の種類 */
export type CalendarView = z.infer<typeof viewSchema>;

/**
 * 一段広い表示。日を詰めて見ていて全体を見たくなったとき、表示の切替を開かずにタブで広げられるように。
 * 月表示は既に一番広いので無い。リスト表示は期間が絞り込みで決まり広い狭いが無いので、見渡せる月表示へ出す。
 */
const widerView: Partial<Record<CalendarView, CalendarView>> = {
  day: 'week',
  week: 'month',
  list: 'month',
};

/**
 * 下部ナビ・サイドナビの「予定」を押したときの検索パラメータ。current は押したときに見ている画面の物。
 * カレンダーを見ているなら一段広い表示へ移り、見ていた日はその中に残す。
 * 月表示やほかの画面からは何も付けない（最後に開いた表示の今日が開く。`use-calendar-page.ts` の storedView）。
 * 表示（view）を持つ検索パラメータはカレンダーだけなので、それが読めればカレンダーを見ている。
 */
export function calendarNavSearch(current: Partial<Record<string, unknown>>) {
  const view = viewSchema.safeParse(current.view).data;
  const wider = view && widerView[view];
  if (!wider) return {};
  return { view: wider, date: dateStringSchema.optional().catch(undefined).parse(current.date) };
}
