import { type ReactNode, useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { ScrollAwayHeader } from './ScrollAwayHeader.tsx';
import { useEdgeObserver } from './use-edge-observer.ts';
import { ignoreScrollSoFar } from './use-scrolled-down.ts';

/** 一覧の上に貼り付けておく物とその出し方。一覧を包む部品（`HistoryList` など）はこれをそのまま受けて渡す */
export type InfiniteScrollHeaderProps = {
  /** 一覧の上に貼り付けておく物（絞り込みのフォーム、残高など） */
  header?: ReactNode;
  /** 下へスクロールしている間は header を隠す（`ScrollAwayHeader`）。false なら常に出しておく */
  headerScrollsAway?: boolean;
};

type Props = InfiniteScrollHeaderProps & {
  children: ReactNode;
  /** 先頭に近づいたとき。undefined ならそれより前は無い（読み込み中を含む） */
  onReachStart?: (() => void) | undefined;
  /** 末尾に近づいたとき。undefined ならそれより後は無い（読み込み中を含む） */
  onReachEnd?: (() => void) | undefined;
  /**
   * 最初に出す位置。block が start なら要素を見出しのすぐ下（画面の一番上）へ、end なら要素の下端を
   * 画面の下端（下部ナビに覆われない所。AppShell の scroll-padding-bottom）へ置く。
   * 省くか要素が見つからなければ末尾を出す
   */
  initial?: { block: 'start' | 'end'; target: (list: HTMLElement) => Element | null };
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
 * - 最初の位置は、上か下が足りずに目当ての所まで動かせなければ、続きが読まれるたびに合わせ直す。
 *   利用者が自分で動かし始めたらやめる
 * - ここで動かした分は、header を隠すかを決めるスクロールの向きに数えないよう、描画のたびに `ignoreScrollSoFar` で除く
 */
export function InfiniteScroll({
  header,
  headerScrollsAway = false,
  children,
  onReachStart,
  onReachEnd,
  initial,
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
      const target = initial?.target(list);
      if (target) {
        pinned.current =
          initial?.block === 'end' ? !scrollToBottom(target) : !scrollToTop(target, headerBottom);
      } else {
        window.scrollTo(0, document.documentElement.scrollHeight);
        pinned.current = false;
      }
    } else if (anchor.current?.element.isConnected) {
      const { element, top } = anchor.current;
      window.scrollBy(0, element.getBoundingClientRect().top - top);
    }
    measure();
    ignoreScrollSoFar();
  });

  useEdgeObserver(startRef, onReachStart);
  useEdgeObserver(endRef, onReachEnd);

  return (
    <>
      <ScrollAwayHeader ref={headerRef} pinned={!headerScrollsAway}>
        {header}
      </ScrollAwayHeader>
      <div ref={startRef} />
      <div ref={listRef}>{children}</div>
      <div ref={endRef} />
    </>
  );
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

/**
 * target の下端を画面の下端（scroll-padding-bottom の分だけ上）に置き、置けたかを返す
 * （上が足りないと途中で止まる）。位置の計算はブラウザの scrollIntoView に任せる
 */
function scrollToBottom(target: Element): boolean {
  target.scrollIntoView({ block: 'end', behavior: 'instant' });
  const root = document.documentElement;
  const padding = Number.parseFloat(getComputedStyle(root).scrollPaddingBottom) || 0;
  return Math.abs(target.getBoundingClientRect().bottom - (root.clientHeight - padding)) < 1;
}
