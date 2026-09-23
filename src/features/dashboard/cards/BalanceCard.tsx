import Skeleton from '@mui/material/Skeleton';
import { QueryView } from '../../../lib/ui/QueryView.tsx';
import { BalanceSummary } from '../../expenses/components/BalanceSummary.tsx';
import { useBalance } from '../../expenses/queries.ts';
import { DashboardCardFrame } from './DashboardCardFrame.tsx';

/** 立替残高: 「A→B に n 円」。0 なら精算済み。立替ページと同じ残高を読む */
export function BalanceCard() {
  const query = useBalance();
  return (
    <DashboardCardFrame title="立替残高" link={{ to: '/expenses' }}>
      <QueryView query={query} skeleton={<Skeleton variant="text" width={180} height={40} />}>
        {(balance) => <BalanceSummary balance={balance} />}
      </QueryView>
    </DashboardCardFrame>
  );
}
