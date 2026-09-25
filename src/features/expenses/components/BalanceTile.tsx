import PaymentsIcon from '@mui/icons-material/Payments';
import { StatusTile } from '../../../lib/ui/StatusTile.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { formatYen } from '../format.ts';
import type { Balance } from '../queries.ts';

type Props = {
  balance: Balance;
  onClick: () => void;
};

/**
 * 立替残高のタイル（ホーム。`StatusTile`）: 金額（0 なら「精算済み」）と、誰が誰に払うと精算か。
 * タップで立替の入力を開く。アイコンは右下の追加ボタンの「立替」と同じ。
 * 立替画面の残高（`BalanceSummary`）と同じ View Transition の名前を持ち、行き来するとその場から動く。
 */
export function BalanceTile({ balance, onClick }: Props) {
  const { label } = useUserLabels();
  return (
    <StatusTile
      icon={PaymentsIcon}
      label="立替残高"
      value={balance.amount === 0 ? '精算済み' : formatYen(balance.amount)}
      sub={balance.amount === 0 ? '' : `${label(balance.fromUserId)} → ${label(balance.toUserId)}`}
      transitionName="balance"
      onClick={onClick}
    />
  );
}
