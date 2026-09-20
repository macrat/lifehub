import { todayWidget } from '../../features/calendar/dashboard.ts';
import { expensesWidget } from '../../features/expenses/dashboard.ts';
import { lemonWidget } from '../../features/lemon/dashboard.ts';
import type { CardOf } from './types.ts';

/** ホームのカード一覧。新しい feature のカードはここに 1 行足す。 */
const widgets = [todayWidget, expensesWidget, lemonWidget] as const;

export type DashboardCard = CardOf<(typeof widgets)[number]>;

export async function loadDashboard(ctx: { userId: string; now: Date }): Promise<DashboardCard[]> {
  const cards = await Promise.all(
    widgets.map(async (widget) => ({
      id: widget.id,
      order: widget.order,
      data: await widget.load(ctx),
    })),
  );
  return (cards as DashboardCard[]).sort((a, b) => a.order - b.order);
}
