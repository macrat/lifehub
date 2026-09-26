import Typography from '@mui/material/Typography';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { formatYen } from '../format.ts';
import type { Balance } from '../queries.ts';

/** 「A→B に n 円」の 1 行表示。0 なら「精算済み」。 */
export function BalanceSummary({ balance }: { balance: Balance }) {
  const { label } = useUserLabels();
  return (
    <>
      {balance.amount === 0 ? (
        <Typography color="textSecondary">精算済み</Typography>
      ) : (
        <>
          <Typography variant="h5" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatYen(balance.amount)}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {label(balance.fromUserId)} が {label(balance.toUserId)} に支払うと精算
          </Typography>
        </>
      )}
    </>
  );
}
