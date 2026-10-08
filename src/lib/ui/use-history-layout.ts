import { useMemo } from 'react';
import { today } from '../../../shared/date.ts';
import { arrangeAroundToday } from '../history.ts';
import type { ScreenHistory } from '../screen-data.ts';

/**
 * 履歴の一覧（`HistoryList`）の並べ方。読んだ分の全部（古い順）を、一覧の最初の位置より上（above）と
 * そこから下（below）に分けて画面に出す順（出どころが `oldestFirst` なら古い順、そうでなければ新しい順）に並べ、
 * 古い側の端（古い順なら上、新しい順なら下）を古いほうのページを読み足す端にする（`InfiniteScroll` の load）。
 */
export function useHistoryLayout<T>({ query, source, loadEarlier }: ScreenHistory<T>) {
  const { data: items, error } = query;
  // 画面は入力のたびに描き直されるので、読んだ記録か日付が変わったときだけ分け直す
  const day = today();
  // biome-ignore lint/correctness/useExhaustiveDependencies: source は機能ごとに 1 つの定数。day は今日で分け直す合図
  const arranged = useMemo(
    () => items && { items, ...arrangeAroundToday(items, source) },
    [items, day],
  );
  return {
    query: { data: arranged, error },
    load: source.oldestFirst ? { top: loadEarlier } : { bottom: loadEarlier },
  };
}
