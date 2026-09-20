import { useQuery } from '@tanstack/react-query';
import { BalanceSummary } from '../../expenses/components/BalanceSummary.tsx';
import { balanceQueryOptions } from '../../expenses/queries.ts';
import { DashboardCardFrame } from './DashboardCardFrame.tsx';

/** 立替残高: 「A→B に n 円」。0 なら精算済み。立替ページと同じクエリを読む */
export function BalanceCard() {
  const { data, error } = useQuery(balanceQueryOptions);
  return (
    <DashboardCardFrame title="立替残高" link={{ to: '/expenses' }} error={error}>
      {data && <BalanceSummary balance={data} />}
    </DashboardCardFrame>
  );
}
