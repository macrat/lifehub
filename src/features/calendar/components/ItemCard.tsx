import RepeatIcon from '@mui/icons-material/Repeat';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatTime } from '../../../lib/date.ts';
import { useOwnerLabel } from '../../users/use-owner-label.ts';
import type { CalendarItem } from '../queries.ts';

type Props = {
  item: CalendarItem;
  onClick: (item: CalendarItem) => void;
};

/** 一覧（日別リスト・週表示・イベント画面）に並ぶカード。 */
export function ItemCard({ item, onClick }: Props) {
  const { label } = useOwnerLabel();
  const time = item.allDay
    ? '終日'
    : item.dayCount > 1
      ? `${item.dayIndex}/${item.dayCount}日目`
      : `${formatTime(item.startsAt)}〜${formatTime(item.endsAt)}`;
  return (
    <Card variant="outlined">
      <CardActionArea onClick={() => onClick(item)} sx={{ px: 1.5, py: 1 }}>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
        >
          <Typography
            variant="body2"
            color="primary"
            sx={{ minWidth: 72, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
          >
            {time}
          </Typography>
          <Stack sx={{ flexGrow: 1, flexBasis: 120, minWidth: 0 }}>
            <Typography sx={{ overflowWrap: 'anywhere' }}>{item.title}</Typography>
            {item.location && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {item.location}
              </Typography>
            )}
          </Stack>
          {item.isRecurring && <RepeatIcon fontSize="small" color="action" />}
          <Chip size="small" label={label(item.ownerUserId)} variant="outlined" />
        </Stack>
      </CardActionArea>
    </Card>
  );
}
