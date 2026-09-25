import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { formatDate } from '../../../lib/date.ts';
import { TILE_MASK } from '../../../lib/ui/squircle.ts';
import { CARE_TYPE_ICONS } from '../care-type-icons.tsx';
import type { CareStatus } from '../queries.ts';

type Props = {
  status: CareStatus;
  onSelect?: ((status: CareStatus) => void) | undefined;
};

/**
 * 項目 1 つの最終実施日と経過日数。タップでその項目にチェックを入れた記録フォームを開く。
 * 名前の左にはその項目のアイコンを出す（記録の一覧のアイコンの凡例になる）。
 * ホーム（葉水・水やりだけ）とレモン画面（6 項目）のどちらもこれを出すので、行き来するときは
 * 同じ項目のタイルがその場から動き、片方にしかない項目はフェードする（View Transition）。
 */
export function CareStatusTile({ status, onSelect }: Props) {
  const Icon = CARE_TYPE_ICONS[status.careType];
  return (
    <Card
      sx={{
        bgcolor: 'action.hover',
        // 角だけなめらかな角丸（`TILE_MASK`。押したときの波紋も同じ形に収まる）
        borderRadius: 0,
        mask: TILE_MASK,
        viewTransitionName: `care-${status.careType}`,
      }}
    >
      <CardActionArea onClick={() => onSelect?.(status)} sx={{ p: 1, height: '100%' }}>
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          {/* 名前がすぐ右にあるので、読み上げではアイコンに名乗らせない（SvgIcon の既定） */}
          <Icon sx={{ fontSize: '1rem' }} />
          {CARE_TYPE_LABELS[status.careType]}
        </Typography>
        <Typography variant="h6" component="p" sx={{ lineHeight: 1.3 }}>
          {status.daysSince === null
            ? '—'
            : status.daysSince === 0
              ? '今日'
              : `${status.daysSince}日前`}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {status.lastDoneAt ? formatDate(status.lastDoneAt) : '記録なし'}
        </Typography>
      </CardActionArea>
    </Card>
  );
}
