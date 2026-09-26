import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import { addDays, today } from '../../../../shared/date.ts';
import type { DateString } from '../../../../shared/types.ts';
import type { DailyWeather } from '../../../../shared/weather.ts';
import { dateColor, formatDate } from '../../../lib/date.ts';
import { formatTemp } from '../format.ts';
import { WeatherIcon } from './WeatherIcon.tsx';
import { WIDE_WIDTH } from './weather-glyphs.ts';

/** 天気のアイコンの高さ（px） */
const ICON_SIZE = 32;

/** アイコンの列の幅（px）。天気が変わる日の横並びが入る幅にして、どの行もアイコンの中央を揃える */
const ICON_COLUMN = Math.ceil((ICON_SIZE * WIDE_WIDTH) / 24);

type Props = {
  days: DailyWeather[];
  /** 祝日（日付を日曜と同じ赤にする。カレンダーと同じ色分け） */
  holidays: ReadonlySet<DateString>;
};

/**
 * 週間天気の一覧。1 日 1 行で、日付・天気のアイコンと名前・最高／最低気温・降水確率を横に並べる。
 * 列の幅を行のあいだで揃えるので、上下に日を見比べやすい（気象庁の週間予報の表と同じ見方）。
 * 最高気温は赤、最低気温は青で、どちらが高いかを数の位置に頼らず見分けられるようにする（天気予報の慣習）。
 */
export function WeeklyForecast({ days, holidays }: Props) {
  if (days.length === 0) {
    return (
      <Typography color="textSecondary" sx={{ p: 2 }}>
        予報がまだありません
      </Typography>
    );
  }
  const now = today();
  const relative: Partial<Record<DateString, string>> = {
    [now]: '今日',
    [addDays(now, 1)]: '明日',
  };
  return (
    <List disablePadding>
      {days.map((w) => (
        <ListItem
          key={w.date}
          divider
          sx={{
            display: 'grid',
            gridTemplateColumns: `4.5em ${ICON_COLUMN}px minmax(0, 1fr) auto 3.5em`,
            alignItems: 'center',
            columnGap: 1.5,
            py: 1.5,
          }}
        >
          <Box>
            <Typography sx={{ color: dateColor(w.date, holidays.has(w.date)) }}>
              {formatDate(w.date)}
            </Typography>
            {relative[w.date] && (
              <Typography variant="caption" color="textSecondary" component="p">
                {relative[w.date]}
              </Typography>
            )}
          </Box>
          <WeatherIcon
            icon={w.icon}
            layout="wide"
            aria-hidden
            sx={{ fontSize: ICON_SIZE, justifySelf: 'center' }}
          />
          <Typography variant="body2" color="textSecondary">
            {w.label}
          </Typography>
          <Typography sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            <Box component="span" sx={{ color: 'error.main' }}>
              {formatTemp(w.tempMax)}
            </Box>
            <Box component="span" sx={{ color: 'text.disabled' }}>
              {' / '}
            </Box>
            <Box component="span" sx={{ color: 'info.main' }}>
              {formatTemp(w.tempMin)}
            </Box>
          </Typography>
          <Typography
            variant="body2"
            color="textSecondary"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 0.25,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {/* 雨のアイコンと同じ開いた傘。天気の列の傘と同じ絵なので「雨の見込み」と読める */}
            <WeatherIcon
              icon={{ symbol: 'rain' }}
              layout="square"
              titleAccess="降水確率"
              sx={{ fontSize: '1rem' }}
            />
            {w.pop === null ? '—' : `${w.pop}%`}
          </Typography>
        </ListItem>
      ))}
    </List>
  );
}
