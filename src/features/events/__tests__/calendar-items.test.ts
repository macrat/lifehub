import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { CalendarItem, CalendarPeriod } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { useCalendarItems } from '../queries.ts';
import { CALENDAR_QUERY_KEY } from '../query-keys.ts';

// React の act を使う（テスト用の描画ライブラリは入れていない）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    weather: [],
  });
  const range = { from: '2026-09-01' as DateString, to: '2026-09-30' as DateString };

  const seen: (CalendarItem[] | undefined)[] = [];
  let rerender!: () => void;
  function Probe() {
    rerender = useReducer((n: number) => n + 1, 0)[1];
    // 範囲は毎回新しいオブジェクトで渡す（呼び出し側は描くたびに作る）
    seen.push(useCalendarItems({ ...range }).data);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
  const flatMap = vi.spyOn(Array.prototype, 'flatMap');
  act(() => rerender());
  const recombined = flatMap.mock.calls.length;
  flatMap.mockRestore();

  expect(recombined).toBe(0);
  expect(seen.length).toBeGreaterThanOrEqual(2);
  expect(seen[0]).toEqual([item]);
  expect(seen.at(-1)).toBe(seen[0]);
  act(() => root.unmount());
  client.clear();
});
