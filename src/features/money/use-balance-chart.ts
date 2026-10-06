import { useEffect, useMemo, useState } from 'react';
import { startOfDate, today } from '../../../shared/date.ts';
import type { MoneyBalance } from '../../../shared/money.ts';
import type { DateString } from '../../../shared/types.ts';
import { usePatchSearch } from '../../lib/search.ts';
import { defaultWindow, needsEarlier } from './balance-chart.ts';

/**
 * 残高の推移のグラフの状態: 出している期間と、古いほうの読み足し。
 * 期間を持つのはグラフ（ECharts の dataZoom）で、操作（ピンチ・ホイールでの拡大縮小、ドラッグでの移動）で変わるたびに
 * ここへ写す（AppBar の期間の表示と読み足しの判断が読む）。グラフへは最初の期間（initial）を渡すだけで、書き戻さない。
 * 出している期間の始まりの手前まで読んでいなければ、古いほうのページを続けて読み足す（`needsEarlier`。過去へ動かし
 * 続けると、読み足した分だけ軸が伸びて、さらに過去へ動かせる）。
 */
export function useBalanceChart(
  balances: readonly MoneyBalance[],
  loadEarlier: (() => void) | null,
) {
  const [initial] = useState(() => defaultWindow(today()));
  const [window, setWindow] = useState(initial);
  // 読んだ最も古い記録（ページの中の並びは決まっていないので、全体から探す）
  const first = balances.reduce<DateString | undefined>(
    (min, { on }) => (min === undefined || on < min ? on : min),
    undefined,
  );
  const earliest = first === undefined ? undefined : startOfDate(first).getTime();

  useEffect(() => {
    if (loadEarlier && needsEarlier(window, earliest)) loadEarlier();
  }, [loadEarlier, window, earliest]);

  // グラフの横軸: 読んだ最も古い記録か最初の期間の始まりの早いほうから、今日まで（変わるのは古いほうを読み足したときだけ）
  const axis = useMemo(
    () => ({ start: Math.min(initial.start, earliest ?? initial.start), end: initial.end }),
    [initial, earliest],
  );

  return {
    window,
    initial,
    axis,
    /** グラフの操作で期間が変わったとき */
    setWindow,
  };
}

/**
 * 出す口座の選び直し（絞り込みの欄）。選んだ口座は URL（accounts）にあり、並びはいつも口座の順（names）にそろえる。
 * 選び直しは履歴に積まない（戻るでお金の画面へ戻れるように）
 */
export function useBalanceAccounts(selected: readonly string[], names: readonly string[]) {
  const patchSearch = usePatchSearch();
  return (name: string, checked: boolean) =>
    patchSearch(
      { accounts: names.filter((n) => (n === name ? checked : selected.includes(n))) },
      { replace: true },
    );
}
