import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { Balance } from '../queries.ts';

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });

/**
 * 「A→B に n 円」の 1 行表示。0 なら「精算済み」。
 * ホームと立替画面のどちらもこれを出すので、行き来するときは残高がその場から動く
 * （View Transition。名前は画面ごとに 1 つだけなので固定でよい）。
 */
export function BalanceSummary({ balance }: { balance: Balance }) {
  const { label } = useUserLabels();
  return (
    <Box sx={{ viewTransitionName: 'balance' }}>
      {balance.amount === 0 ? (
        <Typography color="text.secondary">精算済み</Typography>
      ) : (
        <>
          <Typography variant="h5" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {yen.format(balance.amount)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {label(balance.fromUserId)} が {label(balance.toUserId)} に支払うと精算
          </Typography>
        </>
      )}
    </Box>
  );
}

export function formatYen(amount: number): string {
  return yen.format(amount);
}
