import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import type { DateString } from '../../../../shared/types.ts';
import type { DailyWeather } from '../../../../shared/weather.ts';
import { WEEKDAY_LABELS, weekdayColor, weekdayIndex } from '../../../lib/date.ts';
import { useCalendarDays } from '../queries.ts';
import { DayNumber } from './DayNumber.tsx';
import { CenteredWithWeather, DayWeather } from './DayWeather.tsx';

type Props = {
  days: DateString[];
  /** 時間軸と揃える列（`grid-template-columns`）。左端は時刻の欄 */
  columns: string;
  /** 見出しをタップしたとき（週表示から日表示へ）。渡さなければ押せない */
  onSelectDate?: (date: DateString) => void;
};

/** 週・日のタイムラインの、日付の見出しの行（曜日・日付・天気） */
export function TimelineHeader({ days, columns, onSelectDate }: Props) {
  const { holidays, weather } = useCalendarDays(days);
  const single = days.length === 1;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: columns,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box />
      {days.map((day) => (
        <ButtonBase
          key={day}
          disabled={!onSelectDate}
          onClick={() => onSelectDate?.(day)}
          sx={{
            display: 'flex',
            flexDirection: single ? 'row' : 'column',
            alignItems: 'center',
            justifyContent: single ? 'flex-start' : 'center',
            gap: single ? 1 : 0,
            py: 0.5,
            px: single ? 1 : 0,
            borderLeft: 1,
            borderColor: 'divider',
          }}
        >
          <DayHeading
            day={day}
            single={single}
            holiday={holidays.has(day)}
            weather={weather.get(day)}
          />
        </ButtonBase>
      ))}
    </Box>
  );
}

/**
 * 1 日分の見出しの中身。天気は見出しの右端に出す。
 * 日表示（single）は数字を左に寄せ、週表示は数字を列の中央に置く
 */
function DayHeading({
  day,
  single,
  holiday,
  weather,
}: {
  day: DateString;
  single: boolean;
  holiday: boolean;
  weather: DailyWeather | undefined;
}) {
  const weekday = weekdayIndex(day);
  const number = <DayNumber date={day} size={28} holiday={holiday} />;
  return (
    <>
      <Typography
        variant="caption"
        sx={{
          fontSize: '0.7rem',
          lineHeight: 1.2,
          color: weekday < 5 ? 'text.secondary' : weekdayColor(weekday),
        }}
      >
        {WEEKDAY_LABELS[weekday]}
      </Typography>
      {single ? (
        <>
          {number}
          {weather && <DayWeather weather={weather} size={20} />}
        </>
      ) : (
        <CenteredWithWeather weather={weather} size={14}>
          {number}
        </CenteredWithWeather>
      )}
    </>
  );
}
