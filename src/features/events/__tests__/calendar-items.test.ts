import { QueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import type { CalendarItem, CalendarPeriod } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { renderHook } from '../../../lib/__tests__/render-hook.ts';
import { useCalendarItems } from '../queries.ts';
import { CALENDAR_QUERY_KEY } from '../query-keys.ts';

/**
 * 描き直しても手元のキャッシュが変わらなければ、繋ぎ直さずに同じ配列を返す。
 * 受け取る側（日ごとのまとめ・レーンの割り当て）は配列の同一性で memo する。カレンダーはドラッグの
 * 1 コマごとに描き直すので、そのたびに全項目を繋いで比べ直すと重い。
 */
it('キャッシュが変わらなければ、描き直しても繋ぎ直さずに同じ配列を返す', () => {
  const client = new QueryClient();
  const item = { id: 'a', placementDate: '2026-09-10' } as CalendarItem;
  client.setQueryData<CalendarPeriod>([...CALENDAR_QUERY_KEY, '2026-09'], {
    items: [item],
    holidays: [],
    weather: { daily: [], hourly: [] },
  });
  const range = { from: '2026-09-01' as DateString, to: '2026-09-30' as DateString };

  const seen: (CalendarItem[] | undefined)[] = [];
  const { rerender } = renderHook(
    () => {
      // 範囲は毎回新しいオブジェクトで渡す（呼び出し側は描くたびに作る）
      seen.push(useCalendarItems({ ...range }).data);
    },
    { client },
  );
  const flatMap = vi.spyOn(Array.prototype, 'flatMap');
  rerender();
  const recombined = flatMap.mock.calls.length;
  flatMap.mockRestore();

  expect(recombined).toBe(0);
  expect(seen.length).toBeGreaterThanOrEqual(2);
  expect(seen[0]).toEqual([item]);
  expect(seen.at(-1)).toBe(seen[0]);
  client.clear();
});
