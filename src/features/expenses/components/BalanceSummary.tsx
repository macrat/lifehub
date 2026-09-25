import Typography from '@mui/material/Typography';
import { textTransitionSx } from '../../../lib/ui/text-transition.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { BALANCE_TRANSITION_NAME } from '../balance-transition.ts';
import { formatYen } from '../format.ts';
import type { Balance } from '../queries.ts';

/** 金額（0 なら「精算済み」）はホームのタイルの金額とその場で動く（`BALANCE_TRANSITION_NAME`） */
const AMOUNT_SX = textTransitionSx(BALANCE_TRANSITION_NAME);

/** 「A→B に n 円」の 1 行表示。0 なら「精算済み」。 */
export function BalanceSummary({ balance }: { balance: Balance }) {
  const { label } = useUserLabels();
  return (
    <>
      {balance.amount === 0 ? (
        <Typography color="textSecondary" sx={AMOUNT_SX}>
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
          <Typography variant="body2" color="textSecondary">
            {label(balance.fromUserId)} が {label(balance.toUserId)} に支払うと精算
          </Typography>
        </>
      )}
    </>
  );
}
