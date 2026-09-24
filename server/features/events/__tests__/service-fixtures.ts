import { jst } from '../../../../shared/__tests__/jst.ts';
import { dateRangeQuerySchema } from '../../../../shared/validation/common.ts';
import { createTestUser, truncateAll } from '../../../lib/test-db.ts';

/** events の service のテスト（予定・タスク）で共有する「今日」と、テストごとの DB の準備 */

// 「今日」を 2026-09-14（月）の正午に固定する
export const now = jst('2026-09-14T12:00:00');
export const september = dateRangeQuerySchema.parse({ from: '2026-09-01', to: '2026-09-30' });

/** DB を空にして、自分と相手のユーザーを作り直し、その ID を返す。各テストの前に呼ぶ */
export async function resetUsers() {
  await truncateAll();
  return { userId: await createTestUser('A'), partnerId: await createTestUser('B') };
}
