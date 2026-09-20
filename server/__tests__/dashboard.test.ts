import { describe, expect, it } from 'vitest';
import { createTaskSchema } from '../../shared/validation/tasks.ts';
import { addExpense } from '../features/expenses/service.ts';
import { createTask } from '../features/tasks/service.ts';
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
    await createTask(createTaskSchema.parse({ title: '今日やる' }), a);
    await addExpense({ paidBy: a, amount: 1000, description: 'x', spentOn: '2026-09-01' }, a);

    const cards = await loadDashboard({ userId: a, now: new Date() });
    expect(cards.map((c) => c.id)).toEqual([
      'events-upcoming',
      'tasks-today',
      'expenses-balance',
      'lemon',
    ]);
    const tasks = cards.find((c) => c.id === 'tasks-today');
    expect(tasks?.id === 'tasks-today' && tasks.data.map((t) => t.title)).toEqual(['今日やる']);
    const balance = cards.find((c) => c.id === 'expenses-balance');
    expect(balance?.id === 'expenses-balance' && balance.data).toEqual({
      amount: 500,
      fromUserId: b,
      toUserId: a,
    });
  });
});
