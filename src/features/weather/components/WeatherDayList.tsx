import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Typography from '@mui/material/Typography';
import type { DateString } from '../../../../shared/types.ts';
import type { WeatherDay } from '../../../../shared/weather.ts';
import { dateColor, formatDate } from '../../../lib/date.ts';
import { formatTemp } from '../format.ts';
import { HourlyForecast } from './HourlyForecast.tsx';
import { WeatherIcon } from './WeatherIcon.tsx';
import { WIDE_WIDTH } from './weather-glyphs.ts';

/** 天気のアイコンの高さ（px） */
const ICON_SIZE = 32;

/** アイコンの列の幅（px）。天気が変わる日の横並びが入る幅にして、どの行もアイコンの中央を揃える */
const ICON_COLUMN = Math.ceil((ICON_SIZE * WIDE_WIDTH) / 24);

type Props = {
  days: WeatherDay[];
  /** 祝日（日付を日曜と同じ赤にする。カレンダーと同じ色分け） */
  holidays: ReadonlySet<DateString>;
  /** 3 時間ごとの天気を開いているか */
  isOpen: (date: DateString) => boolean;
  /** 行を押したとき（3 時間ごとの天気を開け閉めする） */
  onToggle: (date: DateString) => void;
};

/**
 * 週間天気の一覧（日付順）。1 日 1 行で、日付・天気のアイコンと名前・最高／最低気温・降水確率を横に並べる。
 * 列の幅を行のあいだで揃えるので、上下に日を見比べやすい（気象庁の週間予報の表と同じ見方）。
 * 最高気温は赤、最低気温は青で、どちらが高いかを数の位置に頼らず見分けられるようにする（天気予報の慣習）。
 * 3 時間ごとの天気がある日（取り始めてからの過ぎた日と、明日まで）は、行を押すとその下に開く（`HourlyForecast`）。
 * 無い日（明後日から）の行は押せない。
 * 行には日付（`data-date`）を持たせ、画面が最初に今日を一番上に出すのに使う。
 */
export function WeatherDayList({ days, holidays, isOpen, onToggle }: Props) {
  return (
    <List disablePadding>
      {days.map((day) => {
        const expandable = day.hourly.length > 0;
        const open = expandable && isOpen(day.date);
        return (
          <Box
            key={day.date}
            component="li"
            data-date={day.date}
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            <ListItemButton
              disabled={!expandable}
              aria-expanded={expandable ? open : undefined}
              onClick={() => onToggle(day.date)}
              sx={{
                display: 'grid',
                gridTemplateColumns: `4.5em ${ICON_COLUMN}px minmax(0, 1fr) auto 3.5em`,
                alignItems: 'center',
                columnGap: 1.5,
                py: 1.5,
                // 押せない行も薄くしない（天気そのものは読めるので）
                '&.Mui-disabled': { opacity: 1 },
              }}
            >
              <Typography sx={{ color: dateColor(day.date, holidays.has(day.date)) }}>
                {formatDate(day.date)}
              </Typography>
              <WeatherIcon
                icon={day.icon}
                layout="wide"
                aria-hidden
                sx={{ fontSize: ICON_SIZE, justifySelf: 'center' }}
              />
              <Typography variant="body2" color="textSecondary">
                {day.label}
              </Typography>
              <Typography sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                <Box component="span" sx={{ color: 'error.main' }}>
                  {formatTemp(day.tempMax)}
                </Box>
                <Box component="span" sx={{ color: 'text.disabled' }}>
                  {' / '}
                </Box>
                <Box component="span" sx={{ color: 'info.main' }}>
                  {formatTemp(day.tempMin)}
                </Box>
              </Typography>
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  // 傘は列の左端、数は右端に揃える（「0%」のように短くても傘の位置が動かない）
                  justifyContent: 'space-between',
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
                {day.pop === null ? '—' : `${day.pop}%`}
              </Typography>
            </ListItemButton>
            {expandable && (
              <Collapse in={open}>
                <HourlyForecast hourly={day.hourly} />
              </Collapse>
            )}
          </Box>
        );
      })}
    </List>
  );
}
