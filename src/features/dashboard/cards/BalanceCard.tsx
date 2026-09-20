import { BalanceSummary } from '../../expenses/components/BalanceSummary.tsx';
import type { DashboardCardOf } from '../queries.ts';
import { DashboardCardFrame } from './DashboardCardFrame.tsx';

export function BalanceCard({ card }: { card: DashboardCardOf<'expenses-balance'> }) {
  return (
    <DashboardCardFrame title="立替残高" link={{ to: '/expenses' }}>
      <BalanceSummary balance={card.data} />
    </DashboardCardFrame>
  );
}
