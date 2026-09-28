import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { createFileRoute } from '@tanstack/react-router';
import { WeatherDayList } from '../../features/weather/components/WeatherDayList.tsx';
import { useHomeWeatherDay, useWeatherDays } from '../../features/weather/queries.ts';
import { useExpandedDays } from '../../features/weather/use-expanded-days.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { HistoryList } from '../../lib/ui/HistoryList.tsx';
import { useGoBack } from '../../lib/ui/use-go-back.ts';

export const Route = createFileRoute('/_authenticated/weather')({
  staticData: { ownsScroll: true },
  component: WeatherPage,
});

/** 一覧の幅の上限（PC）。1 行に日付から降水確率までを目で追える幅に留める（ホームのタイムラインと同じ） */
const MAX_WIDTH = 640;

/**
 * 天気（東京地方）。上が古く下が新しい 1 日 1 行の一覧で、最初は今日を一番上に出し、上へスクロールすると
 * 過ぎた日を読み足す（`useWeatherDays`、`HistoryList`）。下の端は週間予報の終わり。
 * 行を押すとその日の 3 時間ごとの天気が開く（今日と明日は最初から開いている。`useExpandedDays`）。
 * ホームの天気のタイルと、予定画面の日付の横の天気から開く（下部ナビには置かない）ので、AppBar の左に
 * 戻るボタンを置き、その右に地域の名前を出す。
 */
function WeatherPage() {
  const history = useWeatherDays();
  const expanded = useExpandedDays();
  const goBack = useGoBack();
  const homeDay = useHomeWeatherDay();
  return (
    <>
      <AppBarContent>
        <IconButton aria-label="戻る" onClick={goBack} size="small">
          <ArrowBackIosNewIcon fontSize="small" />
        </IconButton>
        <Typography component="h1" variant="subtitle1">
          東京
        </Typography>
      </AppBarContent>
      <Box sx={{ maxWidth: MAX_WIDTH, mx: 'auto' }}>
        <HistoryList history={history} emptyMessage="予報がまだありません">
          {(days) => (
            <WeatherDayList
              days={days}
              homeDate={homeDay.date}
              isOpen={expanded.isOpen}
              onToggle={expanded.toggle}
            />
          )}
        </HistoryList>
      </Box>
    </>
  );
}
