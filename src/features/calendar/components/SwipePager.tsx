import Box from '@mui/material/Box';
import {
  type ReactNode,
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { SYNC_SCROLL_SELECTOR } from './markers.ts';

type Props<T extends string> = {
  /** 前・今・次の 3 面が受け持つページ。面を見分ける印でもある（下記） */
  pages: readonly [T, T, T];
  /** 前（-1）・次（1）のページへ移るとき */
  onMove: (direction: 1 | -1) => void;
  /** 1 面の中身。offset は -1（前）・0（今）・1（次） */
  children: (page: T, offset: -1 | 0 | 1) => ReactNode;
};

/**
 * 横スワイプで前後のページへ移る入れ物（Google カレンダー方式）。前・今・次の 3 面を横に並べ、
 * 指に追従する動きも吸着もブラウザのスクロールとスクロールスナップに任せる。
 * 自前に touch イベントを追いかけるより滑らかで、慣性・トラックパッドの横スクロールにもそのまま乗る。
 *
 * 吸着し終えたところ（scrollend）が中央でなければページを移し、中央に戻す。新しく要る端の面は
 * そのあとに足すので、スワイプを続けていくらでも先へ進める（`drawn`）。
 *
 * 面の key はページそのもの。1 つ進んでも 3 面のうち 2 面は同じページを受け持つので、React は
 * その 2 面をそのまま（DOM も中身も）使い回し、新しく描くのは端の 1 面だけになる。key を位置
 * （-1・0・1）にすると 3 面とも中身が入れ替わって全部描き直しになり、描き終わるまで中央に戻せず
 * スワイプが端で止まる。中身（children）も props が同じなら描き直しを省けるようにしておくこと。
 */
export function SwipePager<T extends string>({ pages, onMove, children }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  /**
   * 中身を描いてある面。表示中の面は必ず描き、それ以外は次の描画（transition）で足す。
   *
   * WHY: ページが変わったとき、中央に戻せるのはその描画が終わってから（下の useLayoutEffect）。
   * 戻るまでは端に張り付いたままで、続けてスワイプしても動かない（「詰まる」）。表示中の面は
   * 既に描いてあるもの（スワイプで移った先は前後の面として描き終えている）なので props も変わらず、
   * 残る端の 1 面を切り離せばこの描画は空になり、中央へすぐ戻れる。
   *
   * WHY 次の描画も transition: 描き終わる前に次のスワイプが来たら React が捨てて描き直せる。
   * 通り過ぎる月を描き切ってから次へ進む、ということにならない。
   *
   * WHY 表示中の面は必ず描く: 表示を切り替えるときは View Transition が「切り替え直後の描画」を
   * 撮って前後の画面を比べる。そこに表示中の面の項目が無いと、同じ予定がその場から動かず
   * 消えて出るだけになる（前後の面は inert で対象外なので、要るのは表示中の面だけ。
   * `src/main.tsx`・`src/lib/theme.ts`）。
   *
   * WHY NOT useDeferredValue: 低優先度への切り下げは、今の描画が緊急のときにだけ効く。ページの
   * 移動は router が既に transition で起こしているので、値はそのまま返って同じ描画に載ってしまう。
   */
  const [drawn, setDrawn] = useState<readonly T[]>(() => [pages[1]]);

  // 配列は描画ごとに別物なので、受け持つページそのものを依存に置く
  useEffect(() => {
    startTransition(() => setDrawn(pages));
  }, [pages[0], pages[1], pages[2]]);

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
            {/* 枠は中身を描く前から 3 つ並べておく。横スクロールの寸法が変わらず、中央に戻す計算がそのまま通る */}
            {offset === 0 || drawn.includes(page) ? children(page, offset) : null}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * 3 面の縦位置（時間軸のスクロール）を表示中の面に揃える。横に動いたときに時刻がずれて見えないように。
 * 基準は 2 番目の枠（＝表示中の面）の中から探す。まだ中身の無い面があると `[data-sync-scroll]` の
 * 並び順は面の位置と一致しない。
 */
function syncScrollTop(el: HTMLElement | null) {
  const top = el?.children[1]?.querySelector<HTMLElement>(SYNC_SCROLL_SELECTOR)?.scrollTop;
  if (top === undefined) return;
  for (const scroller of el?.querySelectorAll<HTMLElement>(SYNC_SCROLL_SELECTOR) ?? []) {
    scroller.scrollTop = top;
  }
}
