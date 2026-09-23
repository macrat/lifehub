import { queryOptions, useQuery } from '@tanstack/react-query';
import type { DateString } from '../../../shared/types.ts';
import { api, ensureOk } from '../../lib/api.ts';

const holidaysQueryOptions = queryOptions({
  queryKey: ['holidays'],
  queryFn: async (): Promise<DateString[]> => {
    const res = await ensureOk(await api.holidays.$get());
    return res.json();
  },
  /**
   * 1 日は取り直さない。
   * WHY: サーバーが配布元から取り直すのは月に 1 回で、それ以外に変わることが無い。読むのは
   * カレンダーの日付の数字（`DayNumber`）で、スワイプや表示の切り替えのたびにマウントし直すので、
   * 既定（staleTime: 0）だとそのたびに問い合わせることになる。
   */
  staleTime: 1000 * 60 * 60 * 24,
});

const EMPTY: ReadonlySet<DateString> = new Set();

function toSet(dates: DateString[]): ReadonlySet<DateString> {
  return new Set(dates);
}

/** 祝日（振替休日・国民の休日を含む）の集合。まだ届いていないか取れなかったときは空（どの日も平日の扱い） */
export function useHolidays(): ReadonlySet<DateString> {
  return useQuery({ ...holidaysQueryOptions, select: toSet }).data ?? EMPTY;
}
