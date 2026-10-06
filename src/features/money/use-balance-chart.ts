import { useEffect, useState } from 'react';
import { startOfDate, today } from '../../../shared/date.ts';
import type { MoneyBalance } from '../../../shared/money.ts';
import { usePatchSearch } from '../../lib/search.ts';
import { type ChartWindow, defaultWindow, needsEarlier } from './balance-chart.ts';

/**
 * 残高の推移のグラフの状態: 出している期間と、古いほうの読み足し。
 * 期間はグラフの操作（ピンチ・ホイールでの拡大縮小、ドラッグでの移動）で変わり、AppBar の期間の表示もこれを読む。
 * 出している期間の始まりの手前まで読んでいなければ、古いほうのページを続けて読み足す（`needsEarlier`。過去へ動かし
 * 続けると、読み足した分だけ軸が伸びて、さらに過去へ動かせる）。
 */
export function useBalanceChart(
  balances: readonly MoneyBalance[],
  loadEarlier: (() => void) | null,
) {
  const [window, setWindow] = useState<ChartWindow>(() => defaultWindow(today()));
  const first = balances[0]?.on;
  const earliest = first === undefined ? undefined : startOfDate(first).getTime();

  useEffect(() => {
    if (loadEarlier && needsEarlier(window, earliest)) loadEarlier();
  }, [loadEarlier, window, earliest]);

  return {
    window,
    /** グラフの横軸の始まり: 読んだ最も古い記録か、出している期間の始まりの早いほう */
    axisStart: Math.min(window.start, earliest ?? window.start),
    /** グラフの操作で期間が変わったとき */
    onWindowChange: setWindow,
  };
}

export type BalanceChartState = ReturnType<typeof useBalanceChart>;

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
