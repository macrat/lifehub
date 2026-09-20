import Typography from '@mui/material/Typography';
import type { DateString } from '../../../../shared/types.ts';
import { isToday, weekdayColor, weekdayIndex } from '../../../lib/date.ts';

type Props = {
  date: DateString;
  size: number;
  /** 表示中の月の外など、薄く出すとき */
  muted?: boolean;
};

/** 日付の数字。今日は primary の丸で塗る。土日は曜日の色 */
export function DayNumber({ date, size, muted = false }: Props) {
  const today = isToday(date);
  return (
    <Typography
      component="span"
      sx={{
        width: size,
        height: size,
        lineHeight: `${size}px`,
        textAlign: 'center',
        borderRadius: '50%',
        fontSize: size < 24 ? '0.7rem' : '0.95rem',
        fontWeight: today ? 700 : 400,
        bgcolor: today ? 'primary.main' : 'transparent',
        color: today
          ? 'primary.contrastText'
          : muted
            ? 'text.disabled'
            : weekdayColor(weekdayIndex(date)),
      }}
    >
      {Number(date.slice(8))}
    </Typography>
  );
}
