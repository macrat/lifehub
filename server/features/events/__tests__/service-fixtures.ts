import { dateRangeQuerySchema } from '../../../../shared/validation/common.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import { createUser } from '../../users/service.ts';

/** events の service のテスト（予定・タスク）で共有する日時の略記と、テストごとの DB の準備 */

export const jst = (s: string) => new Date(`${s}+09:00`);
export const iso = (s: string) => jst(s).toISOString();

// 「今日」を 2026-09-14（月）の正午に固定する
export const now = jst('2026-09-14T12:00:00');
export const september = dateRangeQuerySchema.parse({ from: '2026-09-01', to: '2026-09-30' });

/** DB を空にして、自分と相手のユーザーを作り直し、その ID を返す。各テストの前に呼ぶ */
export async function resetUsers() {
  await truncateAll();
  const user = await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' });
  const partner = await createUser({
    email: 'b@example.com',
    name: 'B',
    password: 'password-123456',
  });
  return { userId: user.id, partnerId: partner.id };
}
