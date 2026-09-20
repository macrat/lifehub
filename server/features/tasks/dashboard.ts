import { today } from '../../../shared/date.ts';
import { defineWidget } from '../../lib/dashboard/types.ts';
import { listOccurrences } from './service.ts';

/** 今日のタスク: 表示規則で今日の位置にある未完了タスク（期限が近い順） */
export const tasksWidget = defineWidget({
  id: 'tasks-today',
  order: 20,
  load: async ({ now }) => {
    const date = today(now);
    const occurrences = await listOccurrences({ from: date, to: date }, now);
    return occurrences
      .filter((o) => o.completedAt === null)
      .map((o) => ({ ...o, kind: 'task' as const }));
  },
});
