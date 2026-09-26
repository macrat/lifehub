import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { createFileRoute } from '@tanstack/react-router';
import { useCalendarDays } from '../../features/calendar/queries.ts';
import { WeatherDayList } from '../../features/weather/components/WeatherDayList.tsx';
import { useWeatherDays } from '../../features/weather/queries.ts';
import { useExpandedDays } from '../../features/weather/use-expanded-days.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { InfiniteScroll } from '../../lib/ui/InfiniteScroll.tsx';
import { BOTTOM_NAV_TOP, STICKY_TOP } from '../../lib/ui/layout.ts';
import { ListSkeleton, QueryView } from '../../lib/ui/QueryView.tsx';
import { useGoBack } from '../../lib/ui/use-go-back.ts';

export const Route = createFileRoute('/_authenticated/weather')({
  staticData: { ownsScroll: true },
  component: WeatherPage,
});

/** 一覧の幅の上限（PC）。1 行に日付から降水確率までを目で追える幅に留める（ホームのタイムラインと同じ） */
const MAX_WIDTH = 640;

/**
 * 今日から下の高さの下限。今日を一番上に置けるよう、今日から先（週間予報の 8 日分）が画面より短くても
 * 画面の高さ（AppBar と、main の下の余白（`AppShell`）を除いた分）まで伸ばす
 */
const UPCOMING_MIN_HEIGHT = {
  xs: `calc(100svh - ${STICKY_TOP} - ${BOTTOM_NAV_TOP} - 96px)`,
  md: `calc(100svh - ${STICKY_TOP} - 96px)`,
};

/**
 * 天気（東京地方）。上が古く下が新しい 1 日 1 行の一覧で、最初は今日を一番上に出し、上へスクロールすると
 * 過ぎた日を読み足す（`useWeatherDays`、`InfiniteScroll`）。下の端は週間予報の終わり。
 * 行を押すとその日の 3 時間ごとの天気が開く（今日と明日は最初から開いている。`useExpandedDays`）。
 * ホームの天気のタイルと、予定画面の日付の横の天気から開く（下部ナビには置かない）ので、AppBar の左に
 * 戻るボタンを置き、その右に地域の名前を出す。
 * 日付の色はカレンダーと同じく土日と祝日で分けるので、祝日は予定画面と同じ月のキャッシュから読む。
 */
function WeatherPage() {
  const history = useWeatherDays();
  const expanded = useExpandedDays();
  const goBack = useGoBack();
  const days = history.query.data;
  const { holidays } = useCalendarDays(
    days ? [...days.past, ...days.upcoming].map((d) => d.date) : [],
  );
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
        <InfiniteScroll
          onReachStart={history.loadEarlier}
          initial={{
            block: 'start',
            target: (list) => list.querySelector<HTMLElement>('[data-part="upcoming"]'),
          }}
          resetKey={history.resetKey}
          ready={history.ready}
          pullToRefresh={['top', 'bottom']}
        >
          <QueryView query={history.query} skeleton={<ListSkeleton rows={8} />}>
            {({ past, upcoming }) =>
              past.length === 0 && upcoming.length === 0 ? (
                <Typography color="textSecondary" sx={{ p: 2 }}>
                  予報がまだありません
                </Typography>
              ) : (
                <>
                  <WeatherDayList
                    days={past}
                    holidays={holidays}
                    isOpen={expanded.isOpen}
                    onToggle={expanded.toggle}
                  />
                  <Box data-part="upcoming" sx={{ minHeight: UPCOMING_MIN_HEIGHT }}>
                    <WeatherDayList
                      days={upcoming}
                      holidays={holidays}
                      isOpen={expanded.isOpen}
                      onToggle={expanded.toggle}
                    />
                  </Box>
                </>
              )
            }
          </QueryView>
        </InfiniteScroll>
      </Box>
    </>
  );
}
