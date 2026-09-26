import RefreshIcon from '@mui/icons-material/Refresh';
import CircularProgress from '@mui/material/CircularProgress';
import GlobalStyles from '@mui/material/GlobalStyles';
import Paper from '@mui/material/Paper';
import type { RefObject } from 'react';
import { BOTTOM_NAV_TOP, STICKY_TOP } from './layout.ts';
import { PULL_THRESHOLD, usePullToRefresh } from './use-pull-to-refresh.ts';

/** 印（丸）の大きさ（px） */
const SIZE = 40;

/**
 * 引き切ったときに印が隠れ場所から出ている距離（px）。印がすべて出て、先に少し間が空く。
 * 取り直している間もここに留める。指より遅く動くので、引いている手応えが出る
 */
const REST = SIZE + 16;

/** 引き切った後も引き続けたときに出る最大の距離（px） */
const MAX_TRAVEL = REST * 1.5;

type Props = {
  /** 引ける範囲（アプリの枠） */
  area: RefObject<HTMLElement | null>;
};

/**
 * 引っ張って更新の印。上端から引くときは AppBar の裏（下端）に隠しておき、引いた分だけ下へ出す。
 * 下端から引くときは下部ナビの裏（上端。下部ナビの無い PC では画面の下端の外）に隠しておき、引いた分だけ上へ出す。
 * どちらも指の動く向きに出てくる。
 * 矢印は引き切るまで薄く、引き切ると濃くなって「離せば取り直す」ことを示す。
 * 離して取り直している間は回る印に変わり、取り直し終えると隠れ場所へ戻る。
 *
 * ブラウザの引っ張って更新はここで止め（`html` の `overscroll-behavior-y: contain`）、この部品が代わりを受け持つ。
 * ブラウザのものは iOS のホーム画面の Web アプリには無く、Android では AppBar の上に印が重なるので、
 * どの OS でも同じ動きと見た目になるようにする。none ではなく contain にして、端で跳ね返る動き（iOS）や
 * 光る動き（Android）は残す。
 */
export function PullToRefresh({ area }: Props) {
  const { edge, distance, refreshing } = usePullToRefresh(area);
  /** 引き切るまでの割合（引き切ると 1。その先も伸びる） */
  const ratio = refreshing ? 1 : (distance ?? 0) / PULL_THRESHOLD;
  const progress = Math.min(ratio, 1);
  const travel = Math.min(ratio * REST, MAX_TRAVEL);
  /** 隠れ場所から出す向き（下へ出すなら 1） */
  const direction = edge === 'top' ? 1 : -1;

  return (
    <>
      <GlobalStyles styles={{ html: { overscrollBehaviorY: 'contain' } }} />
      <Paper
        elevation={3}
        aria-hidden
        sx={{
          position: 'fixed',
          ...(edge === 'top'
            ? { top: STICKY_TOP }
            : {
                bottom: { xs: BOTTOM_NAV_TOP, md: 0 },
              }),
          left: '50%',
          // AppBar（drawer + 1）より下、ページの内容（貼り付けた見出しを含む）より上。
          // 下部ナビとは同じ高さで、後に描かれる下部ナビが上に重なる
          zIndex: (t) => t.zIndex.appBar,
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
        }}
        // 指の動きのたびに変わる値は sx ではなく style で渡す。sx は値ごとにクラスを作って
        // スタイルシートに足し続けるので、なぞっている間に規則が溜まっていく
        style={{
          transform: `translate(-50%, ${direction * (travel - SIZE)}px)`,
          visibility: travel > 0 ? 'visible' : 'hidden',
          // 指に付いている間は遅れないよう動きを付けない。離した後だけ滑らかに戻す
          transition: distance === null ? 'transform .2s, visibility .2s' : 'none',
        }}
      >
        {refreshing ? (
          <CircularProgress size={SIZE / 2} />
        ) : (
          <RefreshIcon
            color="primary"
            style={{ opacity: progress < 1 ? 0.4 : 1, transform: `rotate(${progress * 270}deg)` }}
          />
        )}
      </Paper>
    </>
  );
}
