import Typography from '@mui/material/Typography';
import type { DateString } from '../../../../shared/types.ts';
import { dateColor, isToday } from '../../../lib/date.ts';

type Props = {
  date: DateString;
  size: number;
  /** 祝日か（`useHolidays` の集合を引くのは呼び出し側。日ごとに購読させない） */
  holiday: boolean;
  /** 表示中の月の外など、薄く出すとき */
  muted?: boolean;
};

/** 日付の数字。今日は primary の丸で塗る。土日は曜日の色、祝日は日曜と同じ赤 */
export function DayNumber({ date, size, holiday, muted = false }: Props) {
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
        color: today ? 'primary.contrastText' : muted ? 'text.disabled' : dateColor(date, holiday),
      }}
    >
      {Number(date.slice(8))}
    </Typography>
  );
}
