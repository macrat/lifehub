import Typography from '@mui/material/Typography';
import type { DateString } from '../../../shared/types.ts';
import { formatDate, isToday } from '../date.ts';

/**
 * 日付ごとに区切る一覧（カレンダーのリスト表示、立替の履歴）の見出し。
 * 今日はアクセントカラーで「今日」を添え、今どこを見ているかが分かるようにする。
 */
export function DateHeading({ date }: { date: DateString }) {
  const today = isToday(date);
  return (
    <Typography
      variant="caption"
      component="h3"
      sx={{
        px: 2,
        pt: 1,
        pb: 0.25,
        fontWeight: 600,
        color: today ? 'primary.main' : 'text.secondary',
      }}
    >
      {formatDate(date)}
      {today && ' 今日'}
    </Typography>
  );
}
