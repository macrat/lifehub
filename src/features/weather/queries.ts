import { queryOptions, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { addDays, minutesOfDay, today } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { DailyWeather } from '../../../shared/weather.ts';
import { api, ensureOk } from '../../lib/api.ts';
import type { QueryState } from '../../lib/query-client.ts';
import { useNow } from '../../lib/use-now.ts';

/** 今日から週間予報の終わりまでの日ごとの天気（日付順）。週間天気の画面とホームのタイルが読む */
export const weatherQueryOptions = queryOptions({
  queryKey: ['weather'],
  queryFn: async (): Promise<DailyWeather[]> => (await ensureOk(await api.weather.$get())).json(),
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
export type HomeWeather = { label: '今日' | '明日'; weather: DailyWeather | undefined };

/**
 * ホームのタイルに出す天気（`homeWeatherDay` の日）。週間天気と同じクエリから選ぶので、問い合わせは増えない。
 * 開いたままでも 18 時を過ぎれば明日の天気に変わるよう、時計に合わせて選び直す。
 */
export function useHomeWeather(): QueryState<HomeWeather> {
  const { date, label } = homeWeatherDay(useNow());
  const select = useCallback(
    (days: DailyWeather[]): HomeWeather => ({ label, weather: days.find((w) => w.date === date) }),
    [date, label],
  );
  return useQuery({ ...weatherQueryOptions, select });
}
