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
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 1.5,
      }}
    >
      {statuses.map((status) => (
        <Card key={status.careType} sx={{ bgcolor: 'action.hover' }}>
          <CardActionArea onClick={() => onSelect?.(status)} sx={{ p: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {CARE_TYPE_LABELS[status.careType]}
            </Typography>
            <Typography variant="h5" component="p">
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
