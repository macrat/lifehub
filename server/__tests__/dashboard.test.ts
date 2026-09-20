import { describe, expect, it } from 'vitest';
import { createEventSchema } from '../../shared/validation/events.ts';
import { createEvent } from '../features/events/service.ts';
import { addExpense } from '../features/expenses/service.ts';
import { createUser } from '../features/users/service.ts';
import { loadDashboard } from '../lib/dashboard/registry.ts';
import { truncateAll } from '../lib/test-db.ts';

describe('dashboard', () => {
  it('登録された順（order）にカードを返し、各 feature のデータを載せる', async () => {
    await truncateAll();
    const a = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' }))
      .id;
    const b = (await createUser({ email: 'b@example.com', name: 'B', password: 'password-123456' }))
      .id;
    await createEvent(
      createEventSchema.parse({ kind: 'task', title: '今日やる', participantIds: [a] }),
      a,
    );
    await addExpense(
      { fromUserId: a, toUserId: null, amount: 1000, description: 'x', spentOn: '2026-09-01' },
      a,
    );

    const cards = await loadDashboard({ userId: a, now: new Date() });
    expect(cards.map((c) => c.id)).toEqual(['today', 'expenses-balance', 'lemon']);
    const todayCard = cards.find((c) => c.id === 'today');
    expect(todayCard?.id === 'today' && todayCard.data.map((t) => t.title)).toEqual(['今日やる']);
    const balance = cards.find((c) => c.id === 'expenses-balance');
    expect(balance?.id === 'expenses-balance' && balance.data).toEqual({
      amount: 500,
      fromUserId: b,
      toUserId: a,
    });
  });
});
