import Typography from '@mui/material/Typography';
import { useOwnerLabel } from '../../users/use-owner-label.ts';
import type { Balance } from '../queries.ts';

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });

/** 「A→B に n 円」の 1 行表示。0 なら「精算済み」 */
export function BalanceSummary({ balance }: { balance: Balance }) {
  const { label } = useOwnerLabel();
  if (balance.amount === 0) {
    return <Typography color="text.secondary">精算済み</Typography>;
  }
  return (
    <Typography variant="h6" component="p">
      {label(balance.fromUserId)} → {label(balance.toUserId)} に {yen.format(balance.amount)}
    </Typography>
  );
}

export function formatYen(amount: number): string {
  return yen.format(amount);
}
