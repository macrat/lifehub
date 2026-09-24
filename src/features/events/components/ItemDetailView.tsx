import LocationOnIcon from '@mui/icons-material/LocationOnOutlined';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { FILL_TEXT } from '../../../../shared/color.ts';
import { formatDateTime, formatEdge, formatEventRange } from '../../../lib/date.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { CalendarItem } from '../queries.ts';
import { describeRRule } from '../recurrence-options.ts';

/** 予定・タスクの詳細の、読むだけの中身（日時・参加者・繰り返し・場所・メモ） */
export function ItemDetailView({ item }: { item: CalendarItem }) {
  return (
    <>
      <ItemWhen item={item} />
      <ItemChips item={item} />
      {item.location && (
        <Link
          href={mapSearchUrl(item.location)}
          target="_blank"
          rel="noreferrer"
          variant="body2"
          color="text.secondary"
          underline="hover"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <LocationOnIcon fontSize="small" />
          {item.location}
        </Link>
      )}
      {item.note && (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          {item.note}
        </Typography>
      )}
    </>
  );
}

/** 日時。予定は期間を 1 行で、タスクは開始・期限・完了をそれぞれの行で出す */
function ItemWhen({ item }: { item: CalendarItem }) {
  if (item.kind === 'event') {
    return <Typography>{formatEventRange(item.startsAt, item.endsAt, item.allDay)}</Typography>;
  }
  return (
    <>
      {item.startsAt && (
        <Typography>開始: {formatEdge(item.startsAt, 'start', item.allDay)}</Typography>
      )}
      {item.endsAt && (
        <Typography color={item.isOverdue ? 'error' : 'text.primary'}>
          期限: {formatEdge(item.endsAt, 'end', item.allDay)}
          {item.isOverdue && '（超過）'}
        </Typography>
      )}
      {item.completedAt && (
        <Typography color="text.secondary">完了: {formatDateTime(item.completedAt)}</Typography>
      )}
    </>
  );
}

/** 参加者（その人の色で塗る）と、繰り返し・この回だけの変更の印 */
function ItemChips({ item }: { item: CalendarItem }) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
      {item.participantIds.map((id) => (
        <Chip
          key={id}
          size="small"
          label={label(id)}
          sx={{ bgcolor: colorFor(id).fill, color: FILL_TEXT }}
        />
      ))}
      {item.isRecurring && (
        <Chip size="small" variant="outlined" label={describeRRule(item.rrule)} />
      )}
      {item.isModified && <Chip size="small" variant="outlined" label="この回だけ変更あり" />}
    </Stack>
  );
}

/**
 * 場所の文字列を Google マップの検索で開く URL。
 * 住所か店名かは入力した人しか知らないので、座標や地物の ID ではなく文字列のまま検索に渡す。
 */
function mapSearchUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
