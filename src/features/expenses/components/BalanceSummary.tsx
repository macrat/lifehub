import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { formatYen } from '../format.ts';
import type { Balance } from '../queries.ts';

/**
 * 金額（0 なら「精算済み」）の View Transition の名前。ホームのタイルの金額（`BalanceTile`）と同じ名前で、
 * 行き来するときは金額だけがその場から動く（名前は画面ごとに 1 つだけなので固定でよい）。
 * 動く絵は要素の幅で撮られるので、文字の幅に縮めておく（行の幅のままだと、タイルとの幅の違いで文字ごと引き伸ばされる）
 */
const AMOUNT_SX = { width: 'fit-content', viewTransitionName: 'balance' };

/**
 * 「A→B に n 円」の 1 行表示。0 なら「精算済み」。
 */
export function BalanceSummary({ balance }: { balance: Balance }) {
  const { label } = useUserLabels();
  return (
    <Box>
      {balance.amount === 0 ? (
        <Typography color="text.secondary" sx={AMOUNT_SX}>
          精算済み
        </Typography>
      ) : (
        <>
          <Typography
            variant="h5"
            component="p"
            sx={{ ...AMOUNT_SX, fontVariantNumeric: 'tabular-nums' }}
          >
            {formatYen(balance.amount)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {label(balance.fromUserId)} が {label(balance.toUserId)} に支払うと精算
          </Typography>
        </>
      )}
    </Box>
  );
}
