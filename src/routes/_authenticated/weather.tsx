import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCalendarDays } from '../../features/calendar/queries.ts';
import { WeeklyForecast } from '../../features/weather/components/WeeklyForecast.tsx';
import { weatherQueryOptions } from '../../features/weather/queries.ts';
import { ListSkeleton, QueryView } from '../../lib/ui/QueryView.tsx';

export const Route = createFileRoute('/_authenticated/weather')({
  component: WeatherPage,
});

/** 一覧の幅の上限（PC）。1 行に日付から降水確率までを目で追える幅に留める（ホームのタイムラインと同じ） */
const MAX_WIDTH = 640;

/**
 * 週間天気（東京地方）。今日から週間予報の終わりまでを 1 日 1 行で並べる。
 * ホームの天気のタイルと、予定画面の日付の横の天気から開く（下部ナビには置かない）。
 * 日付の色はカレンダーと同じく土日と祝日で分けるので、祝日は予定画面と同じ月のキャッシュから読む。
 */
function WeatherPage() {
  const query = useQuery(weatherQueryOptions);
  const { holidays } = useCalendarDays(query.data?.map((w) => w.date) ?? []);
  return (
    <Box sx={{ maxWidth: MAX_WIDTH, mx: 'auto' }}>
      <QueryView query={query} skeleton={<ListSkeleton rows={8} />}>
        {(days) => <WeeklyForecast days={days} holidays={holidays} />}
      </QueryView>
      <Typography variant="caption" color="textSecondary" component="p" sx={{ p: 2 }}>
        出典: 気象庁ホームページ（東京地方・東京の予報）
      </Typography>
    </Box>
  );
}
