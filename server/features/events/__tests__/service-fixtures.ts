import { jst } from '../../../../shared/__tests__/jst.ts';
import { dateRangeQuerySchema } from '../../../../shared/validation/common.ts';
import { createEventSchema } from '../../../../shared/validation/events.ts';

/** events の service のテスト（予定・タスク）で共有する「今日」と期間 */

// 「今日」を 2026-09-14（月）の正午に固定する
export const now = jst('2026-09-14T12:00:00');
export const september = dateRangeQuerySchema.parse({ from: '2026-09-01', to: '2026-09-30' });

/** userId だけが参加するタスクの入力（残りの項目は input で渡し、省いた項目は既定） */
export const taskInput = (userId: string, input: Record<string, unknown>) =>
  createEventSchema.parse({ kind: 'task', participantIds: [userId], ...input });
