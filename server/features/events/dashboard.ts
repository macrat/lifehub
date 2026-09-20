import { addDays } from 'date-fns';
import { defineWidget } from '../../lib/dashboard/types.ts';
import { listOccurrences } from './service.ts';

const LIMIT = 5;

/** 次の予定: 現在時刻以降で最も近い予定を最大 5 件（自分・相手・共有すべて） */
export const eventsWidget = defineWidget({
  id: 'events-upcoming',
  order: 10,
  load: async ({ now }) => {
    // 直近 90 日を見れば 5 件は埋まる。無ければ空でよい
    const occurrences = await listOccurrences({ from: now, to: addDays(now, 90) });
    return occurrences.filter((o) => new Date(o.endsAt).getTime() > now.getTime()).slice(0, LIMIT);
  },
});
