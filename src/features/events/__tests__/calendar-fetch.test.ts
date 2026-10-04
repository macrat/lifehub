import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { CalendarPeriod } from '../../../../shared/calendar.ts';
import { calendarMonthQueryOptions } from '../queries.ts';
import { CALENDAR_QUERY_KEY } from '../query-keys.ts';

const EMPTY: CalendarPeriod = { items: [], holidays: [], weather: { daily: [], hourly: [] } };

/** 画面の API への要求を受け、`calendar.get` で頼まれた月を残して空の中身を返す */
function stubCalendarApi() {
  const requested: string[][] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    const input = JSON.parse(new URL(url, 'http://localhost').searchParams.get('input') ?? '{}');
    const months: string[] = input[0].months;
    requested.push(months);
    const data = Object.fromEntries(months.map((month) => [month, EMPTY]));
    return Response.json([{ result: { data } }]);
  });
  return requested;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * キャッシュは月ごとでも、同じ時点に要る月はまとめて 1 回で頼む（サーバーはそれを 1 組の問い合わせで読む）。
 * 月ごとに頼む形へ戻ると、サーバーで同じ形の問い合わせが月の数だけ走る（N+1）。
 */
it('画面に入ったときに出す月も、書き込みの後に取り直す月も、まとめて 1 回で頼む', async () => {
  const requested = stubCalendarApi();
  const client = new QueryClient();
  const months = ['2030-04', '2030-05', '2030-06'];
  await Promise.all(months.map((month) => client.fetchQuery(calendarMonthQueryOptions(month))));
  expect(requested).toEqual([months]);
  expect(client.getQueryData([...CALENDAR_QUERY_KEY, '2030-05'])).toEqual(EMPTY);

  // invalidate は購読している月だけを取り直すので、すべての月を取り直す refetch で確かめる
  await client.refetchQueries({ queryKey: CALENDAR_QUERY_KEY });
  expect(requested).toEqual([months, months]);
});
