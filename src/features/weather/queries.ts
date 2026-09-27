import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { addDays, minutesOfDay, today } from '../../../shared/date.ts';
import type { DateString, HistoryPage } from '../../../shared/types.ts';
import type { WeatherDay } from '../../../shared/weather.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { type HistorySource, historyQueryOptions, useHistory } from '../../lib/history.ts';
import type { QueryState } from '../../lib/query-client.ts';
import { useNow } from '../../lib/use-now.ts';

/**
 * 天気の画面の日々（`src/lib/history.ts`）。1 ページは `GET /api/weather?before`（before を省くと、今日の 1 週間前から
 * 週間予報の終わりまで）。上へスクロールすると過ぎた日を 2 週間ずつ読み足す。
 * 今日を一番上に出す一覧なので、今日は未来の側に入れる（`todayAtTop`）。絞り込みは無いので、filter はいつも空。
 */
const weatherHistory: HistorySource<WeatherDay, Record<string, never>> = {
  key: ['weather', 'days'],
  fetch: async (_filter, before, signal) =>
    (await ensureOk(await api.weather.$get({ query: { before } }, { init: { signal } }))).json(),
  dayOf: (day) => day.date,
  sort: (days) => days.toSorted((a, b) => a.date.localeCompare(b.date)),
  todayAtTop: true,
};

const NO_FILTER = {};

/** 天気の画面が読む日々（`useHistory`） */
export function useWeatherDays() {
  return useHistory(weatherHistory, NO_FILTER);
}

/** ホームのタイルが今日から明日の天気へ切り替わる時刻（JST の時） */
const SWITCH_TO_TOMORROW_HOUR = 18;

/**
 * ホームのタイルに出す日。18 時（JST）までは今日、それからは明日。
 * 夕方からは今日の天気はもう済んでいて、知りたいのは明日の支度に要る天気なので切り替える。
 */
export function homeWeatherDay(now: Date): { date: DateString; label: '今日' | '明日' } {
  const date = today(now);
  return minutesOfDay(now) < SWITCH_TO_TOMORROW_HOUR * 60
    ? { date, label: '今日' }
    : { date: addDays(date, 1), label: '明日' };
}

/** ホームのタイルの中身。予報の無い日は weather が無い */
export type HomeWeather = { label: '今日' | '明日'; weather: WeatherDay | undefined };

/**
 * ホームのタイルに出す天気（`homeWeatherDay` の日）。天気の画面と同じキャッシュの最新のページ（今日と明日が入る）
 * から選ぶので、ホームから天気の画面へ移っても取り直しを待たず、どちらかで取り直せばもう片方も変わる。
 * 開いたままでも 18 時を過ぎれば明日の天気に変わるよう、時計に合わせて選び直す。
 */
export function useHomeWeather(): QueryState<HomeWeather> {
  const { date, label } = homeWeatherDay(useNow());
  const select = useCallback(
    (data: InfiniteData<HistoryPage<WeatherDay>>): HomeWeather => ({
      label,
      weather: data.pages[0]?.items.find((w) => w.date === date),
    }),
    [date, label],
  );
  return useInfiniteQuery({ ...historyQueryOptions(weatherHistory, NO_FILTER), select });
}
