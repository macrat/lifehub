import { z } from 'zod';

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

/** カレンダーを見ているときの「予定」タブの行き先。一段広い表示へ移り、見ていた日はその中に残す */
export function widerSearch(current: { view?: unknown; date?: unknown }) {
  const view = viewSchema.safeParse(current.view).data;
  const wider = view && widerView[view];
  return wider ? { view: wider, date: current.date } : {};
}
