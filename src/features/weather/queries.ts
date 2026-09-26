import { queryOptions, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { addDays, minutesOfDay, today } from '../../../shared/date.ts';
import type { DateString, HistoryPage } from '../../../shared/types.ts';
import type { WeatherDay } from '../../../shared/weather.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { type HistorySource, useHistory } from '../../lib/history.ts';
import type { QueryState } from '../../lib/query-client.ts';
import { useNow } from '../../lib/use-now.ts';

const WEATHER_QUERY_KEY = ['weather'] as const;

/** 週間天気の 1 ページ（before を省くと、今日の 1 週間前から週間予報の終わりまで） */
async function fetchWeatherDays(
  before: string | undefined,
  signal?: AbortSignal,
): Promise<HistoryPage<WeatherDay>> {
  return (
    await ensureOk(await api.weather.$get({ query: { before } }, { init: { signal } }))
  ).json();
}

/**
 * 週間天気の画面の日々（`src/lib/history.ts`）。上へスクロールすると過ぎた日を 2 週間ずつ読み足す。
 * 絞り込みは無いので、filter はいつも空。
 */
const weatherHistory: HistorySource<WeatherDay, Record<string, never>> = {
  key: [...WEATHER_QUERY_KEY, 'days'],
  fetch: (_filter, before, signal) => fetchWeatherDays(before, signal),
  dayOf: (day) => day.date,
  sort: (days) => days.toSorted((a, b) => a.date.localeCompare(b.date)),
};

const NO_FILTER = {};

/**
 * 週間天気の画面が読む日々（`useHistory`）。過ぎた日（past）と今日から先（upcoming）に分けて返す。
 * 画面は今日を一番上に出すので、今日を先の側に入れる（`useHistory` は今日を過去の側に入れる）。
 */
export function useWeatherDays() {
  const history = useHistory(weatherHistory, NO_FILTER);
  const data = history.query.data;
  const all = data && [...data.past, ...data.future];
  const split = all?.findIndex((day) => day.date >= today()) ?? -1;
  return {
    ...history,
    query: {
      error: history.query.error,
      data: all && {
        past: split < 0 ? all : all.slice(0, split),
        upcoming: split < 0 ? [] : all.slice(split),
      },
    },
  };
}

/**
 * ホームのタイルが読む、最新のページ（今日と明日が入る）。週間天気の画面とは別に持つ:
 * 画面のほうは読み足す一覧（無限クエリ）で、キャッシュの形が違う。
 */
const homeWeatherQueryOptions = queryOptions({
  queryKey: [...WEATHER_QUERY_KEY, 'home'],
  queryFn: ({ signal }) => fetchWeatherDays(undefined, signal),
});

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
 * ホームのタイルに出す天気（`homeWeatherDay` の日）。
 * 開いたままでも 18 時を過ぎれば明日の天気に変わるよう、時計に合わせて選び直す。
 */
export function useHomeWeather(): QueryState<HomeWeather> {
  const { date, label } = homeWeatherDay(useNow());
  const select = useCallback(
    (page: HistoryPage<WeatherDay>): HomeWeather => ({
      label,
      weather: page.items.find((w) => w.date === date),
    }),
    [date, label],
  );
  return useQuery({ ...homeWeatherQueryOptions, select });
}
