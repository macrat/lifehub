import Box from '@mui/material/Box';
import { type ReactNode, useLayoutEffect, useRef } from 'react';

type Props<T extends string> = {
  /** 前・今・次の 3 面が受け持つページ。面を見分ける印でもある（下記） */
  pages: readonly [T, T, T];
  /** 前（-1）・次（1）のページへ移るとき */
  onMove: (direction: 1 | -1) => void;
  /** 1 面の中身。offset は -1（前）・0（今）・1（次） */
  children: (page: T, offset: -1 | 0 | 1) => ReactNode;
};

/** 面の中で縦にスクロールする部分（時間軸）に付ける。3 面で縦位置を揃えるための印。 */
export const syncScrollProps = { 'data-sync-scroll': '' };
const SYNC_SCROLL_SELECTOR = '[data-sync-scroll]';

/**
 * 横スワイプで前後のページへ移る入れ物（Google カレンダー方式）。前・今・次の 3 面を横に並べ、
 * 指に追従する動きも吸着もブラウザのスクロールとスクロールスナップに任せる。
 * 自前に touch イベントを追いかけるより滑らかで、慣性・トラックパッドの横スクロールにもそのまま乗る。
 *
 * 吸着し終えたところ（scrollend）が中央でなければページを移す。移ったあとは新しい前後を描いたうえで
 * 中央に戻すので、スワイプを続けていくらでも先へ進める。
 *
 * 面の key はページそのもの。1 つ進んでも 3 面のうち 2 面は同じページを受け持つので、React は
 * その 2 面をそのまま（DOM も中身も）使い回し、新しく要るのは端の 1 面だけになる。key を位置
 * （-1・0・1）にすると 3 面とも中身が入れ替わって全部描き直しになり、描き終わるまで中央に戻せず
 * スワイプが端で止まる。中身（children）も props が同じなら描き直しを省けるようにしておくこと。
 */
export function SwipePager<T extends string>({ pages, onMove, children }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);

  // ページが変わったら描画前（＝画面に出る前）に中央へ戻す。アニメーションさせるとスワイプが巻き戻って見える
  // biome-ignore lint/correctness/useExhaustiveDependencies: 中央のページは「変わった」合図で、値そのものは使わない
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.clientWidth;
  }, [pages[1]]);

  return (
    <Box
      ref={ref}
      onScroll={() => syncScrollTop(ref.current)}
      onScrollEnd={() => {
        const el = ref.current;
        if (!el?.clientWidth) return;
        const offset = Math.round(el.scrollLeft / el.clientWidth) - 1;
        if (offset !== 0) onMove(offset > 0 ? 1 : -1);
      }}
      sx={{
        height: '100%',
        display: 'flex',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollSnapType: 'x mandatory',
        // 端まで行っても親やブラウザの「戻る」ジェスチャに渡さない
        overscrollBehaviorX: 'contain',
        scrollbarWidth: 'none',
      }}
    >
      {pages.map((page, i) => {
        const offset = (i - 1) as -1 | 0 | 1;
        return (
          <Box
            key={page}
            // 中央以外はスワイプ中に見えるだけの控え。操作もフォーカスも受けない
            // （フォーカスが入るとブラウザがそこまでスクロールしてページが移ってしまう）、
            // 読み上げや自動操作にも同じ項目が重複して見えないよう隠す
            inert={offset !== 0}
            aria-hidden={offset !== 0}
            sx={{
              flex: '0 0 100%',
              minWidth: 0,
              height: '100%',
              scrollSnapAlign: 'center',
              scrollSnapStop: 'always',
            }}
          >
            {children(page, offset)}
          </Box>
        );
      })}
    </Box>
  );
}

/** 3 面の縦位置（時間軸のスクロール）を表示中の面に揃える。横に動いたときに時刻がずれて見えないように。 */
function syncScrollTop(el: HTMLElement | null) {
  const scrollers = el?.querySelectorAll<HTMLElement>(SYNC_SCROLL_SELECTOR) ?? [];
  const top = scrollers[1]?.scrollTop;
  if (top === undefined) return;
  for (const scroller of scrollers) scroller.scrollTop = top;
}
