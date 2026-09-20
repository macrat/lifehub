import { today } from '../../../shared/date.ts';
import { defineWidget } from '../../lib/dashboard/types.ts';
import { listItems } from './occurrences.ts';

/** 今日: 今日の予定と未完了のタスクを、カレンダーと同じ順（終日 → 時刻順 → 時刻なし）で 1 つの一覧にする */
export const todayWidget = defineWidget({
  id: 'today',
  order: 10,
  load: async ({ now }) => {
    const date = today(now);
    const items = await listItems({ from: date, to: date }, now);
    return items.filter((item) => item.completedAt === null);
  },
});
