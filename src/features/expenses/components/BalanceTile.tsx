import PaymentsIcon from '@mui/icons-material/Payments';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { formatYen } from '../format.ts';
import type { Balance } from '../queries.ts';

type Props = {
  balance: Balance;
  onClick: () => void;
};

/**
 * 立替残高のタイル（ホーム）。レモンの状況のタイル（`CareStatusTile`）と同じ大きさ・同じ 3 段で並ぶ:
 * 名前、金額（0 なら「精算済み」）、誰が誰に払うと精算か。タップで立替の入力を開く。
 * 立替画面の残高（`BalanceSummary`）と同じ View Transition の名前を持ち、行き来するとその場から動く。
 */
export function BalanceTile({ balance, onClick }: Props) {
  const { label } = useUserLabels();
  return (
    <Card sx={{ bgcolor: 'action.hover', viewTransitionName: 'balance' }}>
      <CardActionArea onClick={onClick} sx={{ p: 1, height: '100%' }}>
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          {/* アイコンは右下の追加ボタンの「立替」と同じ */}
          <PaymentsIcon sx={{ fontSize: '1rem' }} />
          立替残高
        </Typography>
        <Typography
          variant="h6"
          component="p"
          noWrap
          sx={{ lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}
        >
          {balance.amount === 0 ? '精算済み' : formatYen(balance.amount)}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" noWrap>
          {/* 精算済みでも 3 段の高さを保ち、隣のタイルと揃える */}
          {balance.amount === 0 ? ' ' : `${label(balance.fromUserId)} → ${label(balance.toUserId)}`}
        </Typography>
      </CardActionArea>
    </Card>
  );
}
