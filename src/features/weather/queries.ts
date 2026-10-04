import type { InfiniteData } from '@tanstack/react-query';
import { useCallback } from 'react';
import { addDays, minutesOfDay, today } from '../../../shared/date.ts';
import type { DateString, HistoryPage } from '../../../shared/types.ts';
import type { WeatherDay } from '../../../shared/weather.ts';
import { api } from '../../lib/api.ts';
import { type HistorySource, historyQueryOptions } from '../../lib/history.ts';
import type { QueryState } from '../../lib/query-client.ts';
import { useStoreInfiniteQuery } from '../../lib/screen-data.ts';
import { useClock } from '../../lib/use-now.ts';

/**
 * 天気の日々（`src/lib/history.ts`。天気の画面とホームのタイルが読む。画面は `useScreenHistory` で購読する）。1 ページは `weather.page`（before を省くと、今日の 1 週間前から
 * 週間予報の終わりまで）。上へスクロールすると過ぎた日を 2 週間ずつ読み足す。
 * 上から古い順に並べて今日を一番上に出す一覧なので、今日は未来の側に入れる（`oldestFirst`）。絞り込みは無いので、filter はいつも空。
 */
export const weatherHistory: HistorySource<WeatherDay, Record<string, never>> = {
  key: ['weather', 'days'],
  fetch: (_filter, before, signal) => api.weather.page.query({ before }, { signal }),
  dayOf: (day) => day.date,
  sort: (days) => days.toSorted((a, b) => a.date.localeCompare(b.date)),
  oldestFirst: true,
};

/** ホームのタイルに出す日と、その呼び方 */
type HomeWeatherDay = { date: DateString; label: '今日' | '明日' };

/** ホームのタイルが今日から明日の天気へ切り替わる時刻（JST の時） */
const SWITCH_TO_TOMORROW_HOUR = 18;

/**
 * ホームのタイルに出す日。18 時（JST）までは今日、それからは明日。
 * 夕方からは今日の天気はもう済んでいて、知りたいのは明日の支度に要る天気なので切り替える。
 */
export function homeWeatherDay(now: Date): HomeWeatherDay {
  const date = today(now);
  return minutesOfDay(now) < SWITCH_TO_TOMORROW_HOUR * 60
    ? { date, label: '今日' }
    : { date: addDays(date, 1), label: '明日' };
}

/**
 * ホームのタイルに出す日（`homeWeatherDay`）。18 時を過ぎれば開いたままでも明日に変わるよう、時計に合わせて選び直す。
 * 描き直すのは日か呼び方が変わったときだけにする（18 時と 0 時の 1 日 2 回。0 時は日が同じまま「明日」が「今日」になる）。
 * WHY NOT `useNow`: 毎分新しい Date を返すので、天気の画面では一覧全体が毎分描き直される。
 */
export function useHomeWeatherDay(): HomeWeatherDay {
  return useClock(homeWeatherDay, (a, b) => a.date === b.date && a.label === b.label);
}

/** ホームのタイルの中身。予報の無い日は weather が無い */
export type HomeWeather = { label: HomeWeatherDay['label']; weather: WeatherDay | undefined };

/**
 * ホームのタイルに出す天気（`useHomeWeatherDay` の日）。天気の画面と同じキャッシュの最新のページ（今日と明日が入る）
 * から選ぶので、ホームから天気の画面へ移っても取り直しを待たず、どちらかで取り直せばもう片方も変わる。
 */
export function useHomeWeather(): QueryState<HomeWeather> {
  const { date, label } = useHomeWeatherDay();
  const select = useCallback(
    (data: InfiniteData<HistoryPage<WeatherDay>>): HomeWeather => ({
      label,
      weather: data.pages[0]?.items.find((w) => w.date === date),
    }),
    [date, label],
  );
  return useStoreInfiniteQuery({
    ...historyQueryOptions(weatherHistory, {}),
    select,
  });
}
