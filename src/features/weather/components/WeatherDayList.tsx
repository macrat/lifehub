import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Typography from '@mui/material/Typography';
import type { DateString } from '../../../../shared/types.ts';
import type { WeatherDay } from '../../../../shared/weather.ts';
import { dateColor, formatDate } from '../../../lib/date.ts';
import {
  dayTransitionName,
  iconTransitionName,
  ONLY_IN_WEATHER_TRANSITION,
} from '../day-transition.ts';
import { formatPop, formatTemp } from '../format.ts';
import { HourlyForecast } from './HourlyForecast.tsx';
import { WeatherIcon } from './WeatherIcon.tsx';
import { WIDE_RATIO } from './weather-glyphs.ts';

/** 天気のアイコンの高さ（px） */
const ICON_SIZE = 32;

/** アイコンの列の幅（px）。天気が変わる日の横並びが入る幅にして、どの行もアイコンの中央を揃える */
const ICON_COLUMN = Math.ceil(ICON_SIZE * WIDE_RATIO);

type Props = {
  days: WeatherDay[];
  /** ホームの天気のタイルと名前を合わせる日（View Transition。`dayTransitionName`） */
  homeDate: DateString;
  /** 3 時間ごとの天気を開いているか */
  isOpen: (date: DateString) => boolean;
  /** 行を押したとき（3 時間ごとの天気を開け閉めする） */
  onToggle: (date: DateString) => void;
};

/**
 * 週間天気の一覧（日付順）。1 日 1 行で、日付・天気のアイコンと名前・最高／最低気温・降水確率を横に並べる。
 * 列の幅を行のあいだで揃えるので、上下に日を見比べやすい（気象庁の週間予報の表と同じ見方）。
 * 最高気温は赤、最低気温は青で、どちらが高いかを数の位置に頼らず見分けられるようにする（天気予報の慣習）。
 * 3 時間ごとの天気か 6 時間ごとの降水確率がある日（取り始めてからの過ぎた日と、明日まで）は、行を押すとその下に開く
 * （`HourlyForecast`）。
 * 無い日（明後日から）の行は押せない。
 * 行には日付（`data-date`）を持たせる。日付の見出しを持たない行なので、E2E はこれで日の行を探す。
 * ホームのタイルに出ている日の行は、タイルと名前を合わせ、ホームと行き来するとその場から動く。
 * 名前は開いた 3 時間ごとの天気を含まない行の部分に付ける（タイルに当たるのは 1 日の要約なので）。
 * アイコンにはどの行にも日ごとの名前（`iconTransitionName`）を付け、予定画面の日付の横やホームのタイルの
 * 同じ日のアイコンとの間で動く。
 */
export function WeatherDayList({ days, homeDate, isOpen, onToggle }: Props) {
  return (
    <List disablePadding>
      {days.map((day) => {
        const expandable = day.slots.length > 0 || day.pops.length > 0;
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
                gridTemplateColumns: `4.5em ${ICON_COLUMN}px minmax(0, 1fr) auto 2.5em`,
                alignItems: 'center',
                columnGap: 1.5,
                py: 1.5,
                viewTransitionName: dayTransitionName(day.date, homeDate),
                // 押せない行も薄くしない（天気そのものは読めるので）
                '&.Mui-disabled': { opacity: 1 },
              }}
            >
              <Typography sx={{ color: dateColor(day.date, day.holiday) }}>
                {formatDate(day.date)}
              </Typography>
              <WeatherIcon
                icon={day.icon}
                layout="wide"
                aria-hidden
                sx={{
                  fontSize: ICON_SIZE,
                  justifySelf: 'center',
                  viewTransitionName: iconTransitionName(day.date),
                  ...ONLY_IN_WEATHER_TRANSITION,
                }}
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
              {/* 数だけで降水確率と読める（天気予報で見慣れた並び）。右に揃えて桁を揃える */}
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
              >
                {formatPop(day.pop)}
              </Typography>
            </ListItemButton>
            {expandable && (
              <Collapse in={open} unmountOnExit>
                <HourlyForecast slots={day.slots} pops={day.pops} />
              </Collapse>
            )}
          </Box>
        );
      })}
    </List>
  );
}
