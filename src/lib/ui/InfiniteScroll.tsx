import { type ReactNode, useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { EdgeSentinel } from './EdgeSentinel.tsx';
import { useInitialPosition } from './initial-position.ts';
import { STICKY_TOP } from './layout.ts';
import type { EdgeLoader } from './loading-edge.ts';
import { ScrollAwayHeader } from './ScrollAwayHeader.tsx';
import { ignoreScrollSoFar } from './use-scrolled-down.ts';

/** 一覧の上に貼り付けておく物とその出し方。一覧を包む部品（`HistoryList` など）はこれをそのまま受けて渡す */
export type InfiniteScrollHeaderProps = {
  /** 一覧の上に貼り付けておく物（絞り込みのフォーム、精算のタイルなど） */
  header?: ReactNode;
  /** 下へスクロールしている間は header を隠す（`ScrollAwayHeader`）。false なら常に出しておく */
  headerScrollsAway?: boolean;
};

type Props = InfiniteScrollHeaderProps & {
  children: ReactNode;
  /**
   * 続きを読み足す端と、その端に近づいたときに読む物（`EdgeLoader`。今は読む物が無ければ null）。
   * top は上へ（古いほうを）、bottom は下へ読み足す。書かなかった端では読み足さず、引っ張って更新で引ける端になる。
   * 読む物は null か関数で、undefined は書けない（読み込み中に undefined を渡すと、読み足さない端に化けるため）
   */
  load: { top: EdgeLoader } | { bottom: EdgeLoader } | { top: EdgeLoader; bottom: EdgeLoader };
  /**
   * 最初に出す位置。target の要素を見出しのすぐ下（画面の一番上）へ置く。
   * 省くか要素が見つからなければ末尾を出す。
   * reveal を渡すと、その要素が画面に収まっていなければ、収まる所まで最小限だけ動かす（`scrollIntoView` の
   * nearest）。見つからない間（まだ読んでいないページにある）は、読み足されるたびに置き直す
   */
  initial?: {
    target: (list: HTMLElement) => HTMLElement | null;
    reveal?: (list: HTMLElement) => HTMLElement | null;
  };
  /** 変わったら最初の位置に戻す（絞り込みを変えたときなど、別の一覧になったとき） */
  resetKey: string;
  /** 最初の位置を決めてよいか（中身が揃ったか）。揃う前に決めると、あとから埋まった分だけずれる */
  ready?: boolean;
};

/**
 * 端に近づくと続きを読む一覧。画面（window）そのものをスクロールする。
 * - 端の見張りは `EdgeSentinel`。読み込み中は読む物を null にすることで、二重に読まない
 * - 前に足しても見ている所が動かないよう、見出しの下で最初に見えている要素（ブラウザの
 *   スクロールアンカーと同じ選び方）の位置を覚えておき、描き直した後でその分だけ戻す。
 *   ブラウザのスクロールアンカー（`overflow-anchor`）は Safari が対応していないので使わず、止めておく
 *   （両方が動くと二重にずれる）
 * - 最初の位置は、上か下が足りずに目当ての所まで動かせなければ、続きが読まれるたびに合わせ直す。
 *   利用者が自分で動かし始めたらやめる
 * - ここで動かした分は、header を隠すかを決めるスクロールの向きに数えないよう、描画のたびに `ignoreScrollSoFar` で除く
 * - 今いる画面のタブをもう一度押すと、最初の位置までなめらかに戻る（`useInitialPosition`）
 * - 引っ張って更新は、続きを読み足す端（load に書いた端）からは引けない（`EdgeSentinel` の印）
 */
export function InfiniteScroll({
  header,
  headerScrollsAway = false,
  children,
  load,
  initial,
  resetKey,
  ready = true,
}: Props) {
  const headerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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

  /**
   * 最初の位置へ動かし、置けたかを返す（目当ての要素が無ければ末尾へ）。位置の計算はブラウザの scrollIntoView に任せる。
   * - 要素の上に、貼り付いた見出しの分の余白を取る（`clearHeader`）
   * - reveal: target を置いたあと、見せる要素が画面に収まる所まで最小限だけ動かす。置けたかはこの要素が
   *   収まったかで決める（target の位置からはずれてよい）。まだ読んでいないページにあって見つからない間は置けていない
   * 上か下が足りないと途中で止まり、置けていない。なめらかに動かすときは動き終わる前に返るので、返り値は当てにならない
   */
  const place = (list: HTMLElement, behavior: ScrollBehavior): boolean => {
    const target = initial?.target(list);
    if (!initial || !target) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
      return true;
    }
    clearHeader(target);
    target.scrollIntoView({ block: 'start', behavior });
    if (initial.reveal) {
      const shown = initial.reveal(list);
      if (!shown) return false;
      clearHeader(shown);
      shown.scrollIntoView({ block: 'nearest', behavior });
      const box = shown.getBoundingClientRect();
      return box.top >= headerBottom() - 1 && box.bottom <= viewBottom() + 1;
    }
    return Math.abs(target.getBoundingClientRect().top - headerBottom()) < 1;
  };

  /**
   * 画面の上端に寄せるとき、貼り付いた見出し（AppBar の下端＋見出しの高さ）に隠れないよう余白を取る。
   * 見出しは貼り付くまでは流れの中にあって今の位置は当てにならないので、貼り付いた後の位置で決める
   */
  const clearHeader = (element: HTMLElement) => {
    const header = headerRef.current?.offsetHeight ?? 0;
    element.style.scrollMarginTop = `calc(${STICKY_TOP} + ${header}px)`;
  };

  /** 画面の下端（下部ナビに覆われない所。AppShell の scroll-padding-bottom） */
  const viewBottom = () => {
    const root = document.documentElement;
    const padding = Number.parseFloat(getComputedStyle(root).scrollPaddingBottom) || 0;
    return root.clientHeight - padding;
  };

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
      pinned.current = !place(list, 'instant');
    } else if (anchor.current?.element.isConnected) {
      const { element, top } = anchor.current;
      window.scrollBy(0, element.getBoundingClientRect().top - top);
    }
    measure();
    ignoreScrollSoFar();
  });

  useInitialPosition(() => {
    if (listRef.current) place(listRef.current, 'smooth');
  });

  return (
    <>
      <ScrollAwayHeader ref={headerRef} pinned={!headerScrollsAway}>
        {header}
      </ScrollAwayHeader>
      {'top' in load && <EdgeSentinel edge="top" onReach={load.top} />}
      <div ref={listRef}>{children}</div>
      {'bottom' in load && <EdgeSentinel edge="bottom" onReach={load.bottom} />}
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
