import { useEffect, useEffectEvent } from 'react';
import type { DateString } from '../../../shared/types.ts';
import type { WeatherDay } from '../../../shared/weather.ts';
import type { ScreenHistory } from '../../lib/screen-data.ts';
import { findDayRow } from './components/day-row.ts';

/**
 * 開いた日（`weatherSearchSchema` の day）の行を、開いたときに画面に収める（`HistoryList` の reveal。
 * 決まりは docs/features/weather.md）。まだ読んでいない古い日なら、そこまで古いほうのページを読み足す
 * （読み足すたびに `InfiniteScroll` が置き直す）。
 */
export function useRevealDay(history: ScreenHistory<WeatherDay>, day: DateString | undefined) {
  const oldest = history.query.data?.[0]?.date;
  const loadEarlier = useEffectEvent(() => history.loadEarlier?.());
  useEffect(() => {
    if (day !== undefined && oldest !== undefined && day < oldest) loadEarlier();
  }, [day, oldest]);
  return day === undefined ? undefined : (list: HTMLElement) => findDayRow(list, day);
}
