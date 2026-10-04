import { useState } from 'react';
import { addMonths, monthRange, monthsInRange, toMonthString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';

type Bounds = { from?: DateString | undefined; to?: DateString | undefined };

/** リスト表示で出している月と、その取得範囲・前後へ広げる操作（`useListMonths`） */
export type ListMonths = {
  /** 出している月（昇順） */
  months: string[];
  /** 取得する範囲。期間の絞り込みがあれば、その内側だけ */
  range: { from: DateString; to: DateString };
  /** 前の月へ広げる。広げられなければ undefined */
  extendStart: (() => void) | undefined;
  /** 次の月へ広げる。広げられなければ undefined */
  extendEnd: (() => void) | undefined;
};

/**
 * リスト表示で出している月（両端含む "YYYY-MM"）。無限スクロールで前後に 1 か月ずつ広げる。
 * 最初は基準の日の月と次の月（基準の日を一番上に置いても下が空かないように）。
 * 絞り込みの期間（bounds）があれば、その外へは広げない。
 */
export function useListMonths(anchor: DateString, bounds: Bounds): ListMonths {
  const key = `${anchor}/${bounds.from ?? ''}/${bounds.to ?? ''}`;
  const minMonth = bounds.from && toMonthString(bounds.from);
  const maxMonth = bounds.to && toMonthString(bounds.to);
  const initial = () => {
    let first = toMonthString(anchor);
    if (minMonth && first < minMonth) first = minMonth;
    if (maxMonth && first > maxMonth) first = maxMonth;
    const next = addMonths(first, 1);
    return { key, first, last: maxMonth && next > maxMonth ? first : next };
  };
  const [stored, setStored] = useState(initial);
  // 基準の日や期間が変わったら描画の中で作り直す（effect で戻すと、古い月で一度描いてしまう）
  const state = stored.key === key ? stored : initial();
  if (stored !== state) setStored(state);

  const from = monthRange(state.first).from;
  const to = monthRange(state.last).to;
  return {
    months: monthsInRange(from, to),
    range: { from: maxDate(from, bounds.from), to: minDate(to, bounds.to) },
    extendStart:
      !minMonth || state.first > minMonth
        ? () => setStored({ ...state, first: addMonths(state.first, -1) })
        : undefined,
    extendEnd:
      !maxMonth || state.last < maxMonth
        ? () => setStored({ ...state, last: addMonths(state.last, 1) })
        : undefined,
  };
}

function maxDate(a: DateString, b: DateString | undefined): DateString {
  return b && b > a ? b : a;
}

function minDate(a: DateString, b: DateString | undefined): DateString {
  return b && b < a ? b : a;
}
