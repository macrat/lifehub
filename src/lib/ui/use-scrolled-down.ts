import { useEffect, useState } from 'react';

/** これより上では隠さない（ページの頭では隠す意味が無い。MUI の `useScrollTrigger` の既定と同じ） */
const THRESHOLD = 100;

// 出ている帯ごとの「向きを測る基準を今の位置に置き直す」と「隠れていたら出す」
const rebases = new Set<() => void>();
const shows = new Set<() => void>();
// 次にスクロールが止まるまで、向きを数えずに帯を出したままにしているか（`showUntilScrollEnd`）
let holding = false;

/**
 * ここまでのスクロールを向きに数えない。一覧が自分で画面を動かしたとき（最初の位置へ動かす、前に足した分を戻す）に呼ぶ。
 * どちらも下向きのスクロールなので、数えると利用者が動かしていないのに帯が隠れる。
 * スクロールするのは画面（window）1 つなので、出ている帯すべての基準を置き直す
 */
export function ignoreScrollSoFar() {
  for (const rebase of rebases) rebase();
}

/**
 * 帯を出し、次にスクロールが止まる（scrollend）まで出したままにする。画面を最初の位置へなめらかに戻すとき
 * （タブの再押下）に、動かし始める前に呼ぶ。最初に開いたときと同じく帯が出ている所へ戻すためで、
 * 動いている間の下向きのスクロールを数えると、戻す途中で帯が隠れてしまう。
 * 動かす必要が無く止まらなかったときは、次に利用者のスクロールが止まるまで続く（その間だけ隠れない）
 */
export function showUntilScrollEnd() {
  holding = true;
  for (const show of shows) show();
  window.addEventListener(
    'scrollend',
    () => {
      holding = false;
      ignoreScrollSoFar();
    },
    { once: true },
  );
}

/** 最後に下へスクロールしたか（ページの頭の近くを除く）。動かなかったスクロールでは変えない */
export function useScrolledDown() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const rebase = () => {
      last = window.scrollY;
    };
    const show = () => setDown(false);
    const onScroll = () => {
      const y = window.scrollY;
      // 出したままにしている間（`showUntilScrollEnd`）は向きを数えない
      if (!holding && y < last) setDown(false);
      else if (!holding && y > last && y > THRESHOLD) setDown(true);
      last = y;
    };
    rebases.add(rebase);
    shows.add(show);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      rebases.delete(rebase);
      shows.delete(show);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  return down;
}
