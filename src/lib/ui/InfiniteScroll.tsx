import Box from '@mui/material/Box';
import { type ReactNode, useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { APP_BAR_HEIGHT } from './AppShell.tsx';

/** 端がこの距離まで近づいたら続きを読む（見えてから読み始めると、読み終わるまで空白が見える） */
const PRELOAD_MARGIN = '400px 0px';

/** AppBar の下端。見出しはここに貼り付く */
const STICKY_TOP = `calc(${APP_BAR_HEIGHT}px + env(safe-area-inset-top))`;

type Props = {
  /** 一覧の上に貼り付けておく物（絞り込みのフォーム、残高など）。一覧を動かしても隠れない */
  header?: ReactNode;
  /**
   * 一覧の中身。直下の子を 1 つのまとまり（日・月）として扱う。前に足したときの位置合わせは
   * 先頭の子を目印にするので、まとまりの中身を後から前へ増やさない（増やすなら新しい子として足す）
   */
  children: ReactNode;
  /** 先頭に近づいたとき。undefined ならそれより前は無い（読み込み中を含む） */
  onReachStart?: (() => void) | undefined;
  /** 末尾に近づいたとき。undefined ならそれより後は無い（読み込み中を含む） */
  onReachEnd?: (() => void) | undefined;
  /**
   * 最初に見せる位置。'end' は末尾。関数なら、それが返す子を見出しのすぐ下（画面の一番上）に置く
   * （返さなければ末尾）
   */
  initialPosition: 'end' | ((list: HTMLElement) => Element | null);
  /** 変わったら最初の位置に戻す（絞り込みを変えたときなど、別の一覧になったとき） */
  resetKey: string;
};

/**
 * 端に近づくと続きを読む一覧。画面（window）そのものをスクロールする。
 * - 端の見張りは `useEdgeObserver`。読み込み中は onReach を渡さないことで、二重に読まない
 * - 先頭に足しても見ている所が動かないよう、先頭の子の位置を覚えておき、足した後でその分だけ戻す。
 *   ブラウザのスクロールアンカー（`overflow-anchor`）は Safari が対応していないので使わず、止めておく
 *   （両方が動くと二重にずれる）
 */
export function InfiniteScroll({
  header,
  children,
  onReachStart,
  onReachEnd,
  initialPosition,
  resetKey,
}: Props) {
  const headerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // 先頭の子と、その画面上の位置。スクロールと描画のたびに測り直す
  const anchor = useRef<{ element: Element; top: number } | null>(null);
  const positionedFor = useRef<string | null>(null);
  // 最初の位置に留めている間か。下が足りずに目当ての所まで動かせなかったときは、続きが読まれるたびに
  // 合わせ直す。利用者が自分で動かし始めたらやめる
  const pinned = useRef(false);

  const measure = useEffectEvent(() => {
    const element = listRef.current?.firstElementChild;
    anchor.current = element ? { element, top: element.getBoundingClientRect().top } : null;
  });

  useEffect(() => {
    // body に付けると中の要素がどれも目印に選ばれなくなり、画面のスクロールアンカーが働かない
    const root = document.body;
    const onScroll = () => measure();
    const unpin = () => {
      pinned.current = false;
    };
    const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    root.style.overflowAnchor = 'none';
    window.addEventListener('scroll', onScroll, { passive: true });
    for (const type of inputs) window.addEventListener(type, unpin, { passive: true });
    return () => {
      root.style.overflowAnchor = '';
      window.removeEventListener('scroll', onScroll);
      for (const type of inputs) window.removeEventListener(type, unpin);
    };
  }, []);

  // 描画のたびに: 別の一覧になったら（留めている間は毎回）最初の位置へ、先頭に足されたら見ていた所へ
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (positionedFor.current !== resetKey) {
      positionedFor.current = resetKey;
      pinned.current = true;
    }
    if (pinned.current) {
      const target = initialPosition === 'end' ? null : initialPosition(list);
      if (target) pinned.current = !scrollToTop(target, headerRef.current);
      else {
        window.scrollTo(0, document.documentElement.scrollHeight);
        pinned.current = false;
      }
    } else {
      const prev = anchor.current;
      if (prev?.element.isConnected && list.firstElementChild !== prev.element) {
        window.scrollBy(0, prev.element.getBoundingClientRect().top - prev.top);
      }
    }
    measure();
  });

  useEdgeObserver(startRef, onReachStart);
  useEdgeObserver(endRef, onReachEnd);

  return (
    <>
      <Box
        ref={headerRef}
        sx={{ position: 'sticky', top: STICKY_TOP, zIndex: 1, bgcolor: 'background.default' }}
      >
        {header}
      </Box>
      <div ref={startRef} />
      <div ref={listRef}>{children}</div>
      <div ref={endRef} />
    </>
  );
}

/**
 * 端の見張り。onReach が変わるたびに付け直す（付け直すとその時点で見えているかを改めて知らせてくる）。
 * 読んだ分が短くて端がまだ見えていれば、続けて次を読む。読む物が無い（onReach が無い）間は見張らない
 */
function useEdgeObserver(
  ref: React.RefObject<HTMLElement | null>,
  onReach: (() => void) | undefined,
) {
  useEffect(() => {
    const edge = ref.current;
    if (!onReach || !edge) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReach();
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(edge);
    return () => observer.disconnect();
  }, [ref, onReach]);
}

/**
 * target を貼り付けた見出しのすぐ下に置き、置けたかを返す（下が足りないと途中で止まる）。
 * 見出しは貼り付くまでは流れの中にあって位置が変わるので、動かした後にもう一度測って合わせる
 */
function scrollToTop(target: Element, header: HTMLElement | null): boolean {
  const gap = () =>
    target.getBoundingClientRect().top - (header?.getBoundingClientRect().bottom ?? 0);
  for (let i = 0; i < 2; i++) window.scrollBy(0, gap());
  return Math.abs(gap()) < 1;
}
