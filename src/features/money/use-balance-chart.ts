import { useEffect, useMemo, useState } from 'react';
import { startOfDate, startOfDay, today } from '../../../shared/date.ts';
import type { MoneyBalance } from '../../../shared/money.ts';
import { usePatchSearch } from '../../lib/search.ts';
import { type ChartWindow, defaultWindow, needsEarlier } from './balance-chart.ts';

/**
 * 残高の推移のグラフの状態: 出している期間と、古いほうの読み足し。期間はここだけが持ち、グラフ・AppBar の期間の表示・
 * 読み足しの判断が読む。グラフの操作（ピンチ・ホイールでの拡大縮小、ドラッグでの移動）で変わると、グラフから知らせが来る。
 * 期間は日に丸めて持ち、日が変わらない知らせでは描き直さない（操作の間は知らせが 1 秒に何十回も来るが、表示も判断も日で足りる）。
 * 出している期間の始まりの手前まで読んでいなければ、古いほうのページを続けて読み足す（`needsEarlier`。過去へ動かし
 * 続けると、読み足した分だけ軸が伸びて、さらに過去へ動かせる）。balances は日の古い順。
 */
export function useBalanceChart(
  balances: readonly MoneyBalance[],
  loadEarlier: (() => void) | null,
) {
  const [initial] = useState(() => defaultWindow(today()));
  const [window, setWindow] = useState(initial);
  const first = balances[0]?.on;
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
    axis,
    /** グラフの操作で期間が変わったとき */
    onWindowChange: (next: ChartWindow) => {
      const day = (time: number) => startOfDay(new Date(time)).getTime();
      const rounded = { start: day(next.start), end: day(next.end) };
      setWindow((prev) =>
        prev.start === rounded.start && prev.end === rounded.end ? prev : rounded,
      );
    },
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
