import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { DateString } from '../../../shared/types.ts';
import { addMonths, monthRange, monthsInRange, toMonthString } from '../../lib/date.ts';
import { calendarMonthQueryOptions } from './queries.ts';

type Bounds = { from?: DateString | undefined; to?: DateString | undefined };

type State = {
  /** この値が変わったら最初の 2 か月に戻す */
  key: string;
  first: string;
  last: string;
  loading: boolean;
};

/**
 * リスト表示で出している月（両端含む "YYYY-MM"）。無限スクロールで前後に 1 か月ずつ広げる。
 * 最初は基準の日の月と次の月（基準の日を一番上に置いても下が空かないように）。
 * 絞り込みの期間（bounds）があれば、その外へは広げない。
 *
 * 月は取得し終えてから広げる（`ensureQueryData`）。空の月を先に出すと、あとから中身が
 * 先頭のまとまりの中に増え、一覧の位置合わせ（先頭の子を目印にする。`InfiniteScroll`）が効かない。
 * 読み込み中は次を広げない（extendStart / extendEnd が undefined）。
 */
export function useListMonths(anchor: DateString, bounds: Bounds) {
  const queryClient = useQueryClient();
  const key = `${anchor}/${bounds.from ?? ''}/${bounds.to ?? ''}`;
  const minMonth = bounds.from && toMonthString(bounds.from);
  const maxMonth = bounds.to && toMonthString(bounds.to);
  const initial = (): State => {
    let first = toMonthString(anchor);
    if (minMonth && first < minMonth) first = minMonth;
    if (maxMonth && first > maxMonth) first = maxMonth;
    const next = addMonths(first, 1);
    return { key, first, last: maxMonth && next > maxMonth ? first : next, loading: false };
  };
  const [stored, setState] = useState(initial);
  // 基準の日や期間が変わったら描画の中で作り直す（effect で戻すと、古い月で一度描いてしまう）
  const state = stored.key === key ? stored : initial();
  if (stored !== state) setState(state);

  const extend = (edge: 'first' | 'last') => {
    const month = addMonths(state[edge], edge === 'first' ? -1 : 1);
    setState((prev) => ({ ...prev, loading: true }));
    queryClient
      .ensureQueryData(calendarMonthQueryOptions(month))
      .then(
        () => setState((prev) => (prev.key === key ? { ...prev, [edge]: month } : prev)),
        // 取れなければ広げない。端が見えたままなら、次の描画で見張りを付け直したときにまた試す
        () => undefined,
      )
      .finally(() => setState((prev) => (prev.key === key ? { ...prev, loading: false } : prev)));
  };

  const canExtendStart = !minMonth || state.first > minMonth;
  const canExtendEnd = !maxMonth || state.last < maxMonth;
  return {
    /** 出している月（昇順） */
    months: monthsInRange(monthRange(state.first).from, monthRange(state.last).to),
    /** 取得する範囲。期間の絞り込みがあれば、その内側だけ */
    range: {
      from: maxDate(monthRange(state.first).from, bounds.from),
      to: minDate(monthRange(state.last).to, bounds.to),
    },
    extendStart: !state.loading && canExtendStart ? () => extend('first') : undefined,
    extendEnd: !state.loading && canExtendEnd ? () => extend('last') : undefined,
  };
}

function maxDate(a: DateString, b: DateString | undefined): DateString {
  return b && b > a ? b : a;
}

function minDate(a: DateString, b: DateString | undefined): DateString {
  return b && b < a ? b : a;
}
