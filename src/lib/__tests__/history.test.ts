import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arrangeAroundToday, type HistorySource } from '../history.ts';

/** 日付だけを持つ記録。today は JST で 2026-10-03 */
type Item = { day: string };
const items: Item[] = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-03', '2026-10-05'].map(
  (day) => ({ day }),
);
const days = (list: Item[]) => list.map((item) => item.day);
const source = (oldestFirst?: boolean): HistorySource<Item, object> => ({
  key: ['test'],
  fetch: () => Promise.reject(new Error('unused')),
  dayOf: (item) => item.day,
  sort: (list) => list,
  oldestFirst,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-03T03:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('arrangeAroundToday', () => {
  it('新しい順（立替・レモン）: 未来を上に、今日までを下に、どちらも新しい順で並べる', () => {
    const { above, below } = arrangeAroundToday(items, source());
    expect(days(above)).toEqual(['2026-10-05']);
    expect(days(below)).toEqual(['2026-10-03', '2026-10-03', '2026-10-02', '2026-10-01']);
  });

  it('古い順（天気）: 昨日までを上に、今日からを下に、どちらも古い順のまま並べる', () => {
    const { above, below } = arrangeAroundToday(items, source(true));
    expect(days(above)).toEqual(['2026-10-01', '2026-10-02']);
    expect(days(below)).toEqual(['2026-10-03', '2026-10-03', '2026-10-05']);
  });

  it('境目が無ければ、新しい順は全部を下に、古い順は全部を上に置く', () => {
    const past = items.slice(0, 2);
    expect(arrangeAroundToday(past, source()).above).toEqual([]);
    expect(days(arrangeAroundToday(past, source()).below)).toEqual(['2026-10-02', '2026-10-01']);
    expect(arrangeAroundToday(past, source(true))).toEqual({ above: past, below: [] });
  });
});
