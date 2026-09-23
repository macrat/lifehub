import Box from '@mui/material/Box';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
} from 'react';
import { APP_BAR_HEIGHT } from './layout.ts';

/** 端がこの距離まで近づいたら続きを読む（見えてから読み始めると、読み終わるまで空白が見える） */
const PRELOAD_MARGIN = '400px 0px';

/** AppBar の下端。見出しはここに貼り付く */
const STICKY_TOP = `calc(${APP_BAR_HEIGHT}px + env(safe-area-inset-top))`;

type Props = {
  /** 一覧の上に貼り付けておく物（絞り込みのフォーム、残高など）。一覧を動かしても隠れない */
  header?: ReactNode;
  children: ReactNode;
  /** 先頭に近づいたとき。undefined ならそれより前は無い（読み込み中を含む） */
  onReachStart?: (() => void) | undefined;
  /** 末尾に近づいたとき。undefined ならそれより後は無い（読み込み中を含む） */
  onReachEnd?: (() => void) | undefined;
  /** 最初に見出しのすぐ下（画面の一番上）へ置く要素。省くか見つからなければ末尾を出す */
  initialTarget?: (list: HTMLElement) => Element | null;
  /** 変わったら最初の位置に戻す（絞り込みを変えたときなど、別の一覧になったとき） */
  resetKey: string;
  /** 最初の位置を決めてよいか（中身が揃ったか）。揃う前に決めると、あとから埋まった分だけずれる */
  ready?: boolean;
};

/**
 * 端に近づくと続きを読む一覧。画面（window）そのものをスクロールする。
 * - 端の見張りは `useEdgeObserver`。読み込み中は onReach を渡さないことで、二重に読まない
 * - 前に足しても見ている所が動かないよう、見出しの下で最初に見えている要素（ブラウザの
 *   スクロールアンカーと同じ選び方）の位置を覚えておき、描き直した後でその分だけ戻す。
 *   ブラウザのスクロールアンカー（`overflow-anchor`）は Safari が対応していないので使わず、止めておく
 *   （両方が動くと二重にずれる）
 * - 最初の位置は、下が足りずに目当ての所まで動かせなければ、続きが読まれるたびに合わせ直す。
 *   利用者が自分で動かし始めたらやめる
 */
export function InfiniteScroll({
  header,
  children,
  onReachStart,
  onReachEnd,
  initialTarget,
  resetKey,
  ready = true,
}: Props) {
  const headerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // 見えている要素と、その画面上の位置。スクロールと描画のたびに測り直す
  const anchor = useRef<{ element: Element; top: number } | null>(null);
  const positionedFor = useRef<string | null>(null);
  const pinned = useRef(false);

  const headerBottom = () => headerRef.current?.getBoundingClientRect().bottom ?? 0;
  const measure = useEffectEvent(() => {
    const element = listRef.current && findAnchor(listRef.current, headerBottom());
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

  // 描画のたびに: 別の一覧になったら（留めている間は毎回）最初の位置へ、そうでなければ見ていた所へ
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (positionedFor.current !== resetKey) {
      if (!ready) return;
      positionedFor.current = resetKey;
      pinned.current = true;
    }
    if (pinned.current) {
      const target = initialTarget?.(list);
      if (target) {
        pinned.current = !scrollToTop(target, headerBottom);
      } else {
        window.scrollTo(0, document.documentElement.scrollHeight);
        pinned.current = false;
      }
    } else if (anchor.current?.element.isConnected) {
      const { element, top } = anchor.current;
      window.scrollBy(0, element.getBoundingClientRect().top - top);
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
 * 端の見張り。読む物がある（onReach がある）間だけ見張る。見張り始めるとその時点で見えているかを
 * 知らせてくるので、読み終わって読む物が戻るたびに端がまだ見えていれば、続けて次を読む
 */
function useEdgeObserver(ref: RefObject<HTMLElement | null>, onReach: (() => void) | undefined) {
  const reach = useEffectEvent(() => onReach?.());
  const enabled = onReach !== undefined;
  useEffect(() => {
    const edge = ref.current;
    if (!enabled || !edge) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reach();
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(edge);
    return () => observer.disconnect();
  }, [ref, enabled]);
}

/** top より下に掛かっている最初の要素を、いちばん奥まで辿る（ブラウザのスクロールアンカーと同じ選び方） */
function findAnchor(list: Element, top: number): Element | null {
  let found: Element | null = null;
  let children = [...list.children];
  for (;;) {
    const next = children.find((el) => el.getBoundingClientRect().bottom > top);
    if (!next) return found;
    found = next;
    children = [...next.children];
  }
}

/**
 * target を貼り付けた見出しのすぐ下に置き、置けたかを返す（下が足りないと途中で止まる）。
 * 見出しは貼り付くまでは流れの中にあって位置が変わるので、動かした後にもう一度測って合わせる
 */
function scrollToTop(target: Element, headerBottom: () => number): boolean {
  const gap = () => target.getBoundingClientRect().top - headerBottom();
  for (let i = 0; i < 2; i++) window.scrollBy(0, gap());
  return Math.abs(gap()) < 1;
}
