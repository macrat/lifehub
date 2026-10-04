import DataLoader from 'dataloader';
import { type CalendarPeriod, inRange } from '../../../shared/calendar.ts';
import type { DateRange } from '../../../shared/date.ts';
import { listItems } from '../events/service.ts';
import { listHolidays } from '../holidays/service.ts';
import { listWeather } from '../weather/service.ts';

/**
 * カレンダーの 1 期間分（項目と、その期間の祝日・天気）の読み手。同じ時点に頼まれた期間をまとめて
 * 読む（`readPeriods`）。読み手は要求ごとに 1 つ使う（`routes.ts`）。まとめ方と理由は
 * docs/features/calendar.md の「API」。
 * 「同じ時点」は `setImmediate` まで（1 本の要求に載った手続きが読みに来るまで待つ）。
 * WHY NOT DataLoader の既定の時点（今の処理の続きが終わった直後）: 手続きはミドルウェアを
 * いくつも通って読みに来るので、最初の手続きだけで送り出してしまう。
 */
export function calendarLoader(): DataLoader<DateRange, CalendarPeriod> {
  return new DataLoader(readPeriods, {
    cache: false,
    batchScheduleFn: (callback) => setImmediate(callback),
  });
}

/** 期間ごとの中身（並びは ranges と同じ）。すべての期間を覆う範囲を 1 組の問い合わせで読み、期間で分ける */
async function readPeriods(ranges: readonly DateRange[]): Promise<CalendarPeriod[]> {
  const whole = {
    from: ranges.map((range) => range.from).reduce((a, b) => (a < b ? a : b)),
    to: ranges.map((range) => range.to).reduce((a, b) => (a > b ? a : b)),
  };
  const [items, holidays, weather] = await Promise.all([
    listItems(whole),
    listHolidays(whole),
    listWeather(whole),
  ]);
  return ranges.map((range) => ({
    items: items.filter((item) => inRange(item.placementDate, range)),
    holidays: holidays.filter((date) => inRange(date, range)),
    weather: {
      daily: weather.daily.filter((w) => inRange(w.date, range)),
      hourly: weather.hourly.filter((w) => inRange(w.date, range)),
    },
  }));
}
