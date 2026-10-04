import { describe, expect, it } from 'vitest';
import { widerSearch } from '../view.ts';

describe('widerSearch', () => {
  it('一段広い表示へ移り、見ていた日はそのまま持っていく', () => {
    expect(widerSearch({ view: 'day', date: '2031-06-05' })).toEqual({
      view: 'week',
      date: '2031-06-05',
    });
    expect(widerSearch({ view: 'week', date: '2031-06-05' })).toEqual({
      view: 'month',
      date: '2031-06-05',
    });
    // リストは期間が絞り込みで決まるので、見渡せる月表示へ出す
    expect(widerSearch({ view: 'list', date: '2031-06-05' })).toEqual({
      view: 'month',
      date: '2031-06-05',
    });
  });

  it('月表示（一番広い）と分からない表示では、行き先の検索パラメータを持たない', () => {
    expect(widerSearch({ view: 'month', date: '2031-06-05' })).toEqual({});
    expect(widerSearch({ view: 'year' })).toEqual({});
  });
});
