import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { formatDate } from '../../../lib/date.ts';
import type { CareStatus } from '../queries.ts';

type Props = {
  statuses: CareStatus[];
  onSelect?: (status: CareStatus) => void;
};

/** 種別ごとの最終実施日と経過日数。タップでその種別の記録フォームを開く。 */
export function CareStatusGrid({ statuses, onSelect }: Props) {
  return (
    <Box
      sx={{
        display: 'grid',
        // スマホは 3 列（5 種別が 2 行に収まる）。広い画面では自然に 1 行に並ぶ。
        gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' },
        gap: 1,
      }}
    >
      {statuses.map((status) => (
        <Card key={status.careType} sx={{ bgcolor: 'action.hover' }}>
          <CardActionArea onClick={() => onSelect?.(status)} sx={{ p: 1, height: '100%' }}>
            <Typography variant="caption" color="text.secondary" component="p">
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
      ))}
    </Box>
  );
}
