import { useEffect } from 'react';
import type { WeatherDay } from '../../../shared/weather.ts';
import type { ScreenHistory } from '../../lib/screen-data.ts';
import { useOpenedWeatherDay } from './day-transition.ts';

/**
 * 週間天気を開いた日（`useOpenedWeatherDay`。予定画面で天気を押した日など）の行を、開いたときに画面に収める
 * （`HistoryList` の reveal）。最初の位置（今日が一番上）から最小限だけ動かすので、今日から先の日なら今日は
 * 一番上のまま、過ぎた日や画面の下にはみ出す先の日ならその行が画面の端に来る。
 * WHY: 押した日のアイコンがその行へ動く（`iconTransitionName`）ので、行が画面の外にあるとアイコンが画面の外
 * （AppBar の裏など）へ飛んで消える。押した日を確かめに来たのに、その日が見えないのも困る。
 * まだ読んでいない古い日なら、そこまで古いほうのページを読み足す（読み足すたびに `InfiniteScroll` が置き直す）。
 * 行は日付（`data-date`）で探し、開いた 3 時間ごとの天気を含まない行の部分（最初の子）を収める。
 */
export function useRevealOpenedDay(history: ScreenHistory<WeatherDay>) {
  const opened = useOpenedWeatherDay();
  const oldest = history.query.data?.items[0]?.date;
  const { loadEarlier } = history;
  useEffect(() => {
    if (opened !== null && oldest !== undefined && opened < oldest) loadEarlier?.();
  }, [opened, oldest, loadEarlier]);
  return opened === null
    ? undefined
    : (list: HTMLElement) =>
        list.querySelector<HTMLElement>(`[data-date="${opened}"] > :first-child`);
}
