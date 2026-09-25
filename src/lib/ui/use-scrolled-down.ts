import { useEffect, useState } from 'react';

/** これより上では隠さない（ページの頭では隠す意味が無い。MUI の `useScrollTrigger` の既定と同じ） */
const THRESHOLD = 100;

// 出ている帯ごとの「向きを測る基準を今の位置に置き直す」
const rebases = new Set<() => void>();

/**
 * ここまでのスクロールを向きに数えない。一覧が自分で画面を動かしたとき（最初の位置へ動かす、前に足した分を戻す）に呼ぶ。
 * どちらも下向きのスクロールなので、数えると利用者が動かしていないのに帯が隠れる。
 * スクロールするのは画面（window）1 つなので、出ている帯すべての基準を置き直す
 */
export function ignoreScrollSoFar() {
  for (const rebase of rebases) rebase();
}

/** 最後に下へスクロールしたか（ページの頭の近くを除く）。動かなかったスクロールでは変えない */
export function useScrolledDown() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const rebase = () => {
      last = window.scrollY;
    };
    const onScroll = () => {
      const y = window.scrollY;
      if (y < last) setDown(false);
      else if (y > last && y > THRESHOLD) setDown(true);
      last = y;
    };
    rebases.add(rebase);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      rebases.delete(rebase);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  return down;
}
