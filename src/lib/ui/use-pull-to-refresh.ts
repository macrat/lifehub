import { isCancelledError, useQueryClient } from '@tanstack/react-query';
import { useMatches } from '@tanstack/react-router';
import { type RefObject, useEffect, useState } from 'react';
import { useOnline } from '../online.ts';
import { notify } from './notice.ts';

/** 離したときに取り直す、指を下ろした所からの引いた向きへの動き（px） */
export const PULL_THRESHOLD = 80;

/** 引く端。上端から下へ引くか、下端から上へ引くか */
export type PullEdge = 'top' | 'bottom';

/** 取り直せなかった知らせを出しておく長さ（ms）。一言なので既定より短く */
const FAILED_NOTICE_MS = 3000;

/** 向きを決めるまでの動き（px）。これに満たない間はタップかもしれないので何もしない */
const DIRECTION_SLOP = 8;

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /**
     * この画面では引っ張って更新をしない。引いて取り直したい内容を持たず、上端に指で動かす操作や
     * 入力が並ぶ画面だけに付ける。それらを触ったつもりの指で取り直しが起きないようにする。
     */
    noPullToRefresh?: boolean;
  }
}

/** 端数の px（高解像度の画面や拡大）で端に届いていないと見誤らないための余裕 */
const EDGE_SLOP = 1;

/**
 * 引く向きの縦のなぞりをブラウザに任せている要素か（`touch-action` がその向きの移動を許している）。
 * 指を下へ動かすのは上端から引くとき（ページを上へ戻す向き）、上へ動かすのは下端から引くとき。
 * 許していない所（シートや予定のつまみなど、なぞりを自分で扱う所）ではブラウザもページを動かさず、
 * ブラウザの引っ張って更新も起きない。同じ宣言を読んで、それに揃える
 */
function pans(style: CSSStyleDeclaration, edge: PullEdge): boolean {
  const { touchAction } = style;
  const pan = edge === 'top' ? /pan-(y|down)/ : /pan-(y|up)/;
  return touchAction === 'auto' || touchAction === 'manipulation' || pan.test(touchAction);
}

/** 要素がその端までスクロールし切っているか */
function scrolledTo(el: Element, edge: PullEdge): boolean {
  if (edge === 'top') return el.scrollTop <= 0;
  return el.scrollTop + el.clientHeight >= el.scrollHeight - EDGE_SLOP;
}

/**
 * 指の下の要素がその端までスクロールし切っているか。スクロールしない要素は常に端にいる
 * （下端では、はみ出した中身で scrollHeight が大きくなっていても見ない）
 */
function atEdge(el: Element, style: CSSStyleDeclaration, edge: PullEdge): boolean {
  return !/auto|scroll/.test(style.overflowY) || scrolledTo(el, edge);
}

/** ページがその端までスクロールし切っている端 */
function pageEdges(): PullEdge[] {
  return (['top', 'bottom'] as const).filter((edge) => scrolledTo(document.documentElement, edge));
}

/**
 * ページ全体をその端から引いてよい押し方か。ブラウザの引っ張って更新と同じく、
 * ページがその端までスクロールし切っていて、指の下に途中までスクロールした所が無く（カレンダーの時間軸などを
 * 端へ戻している最中に取り直しに化けない）、縦のなぞりを自分で扱う所でもないときだけ引ける。
 */
function canPull(target: Element, area: HTMLElement, edge: PullEdge): boolean {
  for (let el: Element | null = target; el && el !== area; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (!atEdge(el, style, edge) || !pans(style, edge)) return false;
  }
  return true;
}

/**
 * 画面の中で引ける端。無限スクロールの一覧がある画面では、どの一覧も続きを読み足さない端だけ（上へ読み足す立替・
 * レモン・天気は下端、下へ読み足すホームは上端、上下に読み足す予定のリストはどちらも引けない）。
 * 無限スクロールの一覧が無い画面は上端だけ。読み足す端は見張り（`useEdgeObserver`）が付ける印（`data-loads-at`）で知る。
 * WHY: 同じ端に 2 つの働きを持たせると、続きを読むつもりで取り直しが起きたり、取り直すつもりで続きが読まれたりして、
 * 指の動きから結果が読めなくなる。引ける端を一覧ごとに宣言させず、読み足す端から決めるので、食い違いが書けない。
 */
function allowedEdges(area: HTMLElement): PullEdge[] {
  const loading = new Set(
    [...area.querySelectorAll<HTMLElement>('[data-loads-at]')].map((el) => el.dataset.loadsAt),
  );
  if (loading.size === 0) return ['top'];
  return (['top', 'bottom'] as const).filter((edge) => !loading.has(edge));
}

/** 指を下ろした所から引ける端。どちらからも引けなければ空 */
function pullableEdges(target: Element, area: HTMLElement): PullEdge[] {
  // ページの途中から始めるなぞり（ふつうのスクロール）は、印を探すより先にここで外す
  const edges = pageEdges();
  if (edges.length === 0) return edges;
  const allowed = allowedEdges(area);
  return edges.filter((edge) => allowed.includes(edge) && canPull(target, area, edge));
}

/**
 * 引っ張って更新（ブラウザのものを止めて代わりに持つ理由は `PullToRefresh`）。
 * 画面が `staticData.noPullToRefresh` で断っている間は何もしない。
 * ページの上端から下へ引く。無限スクロールの一覧がある画面では、続きを読み足す端の逆の端から引ける
 * （下端からなら上へ引く。`allowedEdges`）。ルートごとに決まる宣言（取り直す内容を持たない画面）は `staticData.noPullToRefresh`。
 * ページが短くて上端と下端のどちらにもいるときは、指を動かした向きで決める。
 *
 * `area` は引ける範囲（アプリの枠）。指を下ろしたことはここで受けるので、body に出るダイアログや
 * 段を持たないシートの上の操作は届かない。
 * 枠の中に出る 2 段のシート（カレンダーのクイック入力）は、なぞりを自分で扱う（`touch-action: none`）ので
 * `canPull` が外す。どちらも、シートを下へなぞって閉じる操作が取り直しに化けない。
 *
 * タッチは見るだけで取り上げない（passive）。ページのスクロールはブラウザの速い経路のままで、
 * ここは印を出すための距離を数えるだけ。
 * 誰かが先に取り上げたなぞり（`blockTouchMove`。予定をつまんで動かすなど）と、
 * 2 本指（カレンダーのつまむ操作）は引いたことにしない。
 *
 * 離したときは、いま画面に出ているデータ（有効なクエリ）を取り直す。ページは読み込み直さない。
 * WHY: 画面の状態（カレンダーのクイック入力の下書き、開いているダイアログ、入力途中の文字、
 * スクロール位置）を残したまま、最新の内容だけを持ってくるため。
 * WHY NOT: ページの読み込み直し（ブラウザの引っ張って更新と同じ動き）は、画面の状態を捨てるうえ、
 * インストールした PWA では precache から起動し直すだけで版も変わらない（`src/lib/update.ts`）。
 *
 * オフラインと分かっている間（`useOnline`。案内の帯が出ている間）は引けない。取れる物が無いうえ、
 * 取得はオフラインの間は保留される（`networkMode: 'online'`）ので、取り直しを待つと回る印が止まらない。
 * 引いている途中や取り直している途中でオフラインになったときも、そこで止めて印を戻す
 * （保留した取得はオンラインに戻ったときに続きが走る）。
 *
 * 取り直しが失敗したときは「更新できませんでした」と短く知らせる。オフラインと分からないまま
 * 繋がっていないとき（Wi-Fi には繋がっているが外に出られない、など）もここに来る。
 */
export function usePullToRefresh(area: RefObject<HTMLElement | null>) {
  const allowed = useMatches({
    select: (matches) => !matches.some((match) => match.staticData.noPullToRefresh),
  });
  const online = useOnline();
  const enabled = allowed && online;
  const queryClient = useQueryClient();
  /** 引いた距離。引いていない間は null */
  const [distance, setDistance] = useState<number | null>(null);
  /** 最後に引いた端。離した後も、取り直している間の印をその端に出すために残す */
  const [edge, setEdge] = useState<PullEdge>('top');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const root = area.current;
    if (!enabled || refreshing || !root) return;
    const controller = new AbortController();
    /** 今のなぞりの見張り。なぞりが終われば外す */
    let gesture: AbortController | null = null;

    const cancel = () => {
      gesture?.abort();
      gesture = null;
      setDistance(null);
    };

    const start = (event: TouchEvent) => {
      cancel();
      const touch = event.touches[0];
      const target = event.target;
      if (event.touches.length !== 1 || !touch) return;
      // 指の下は HTML の要素か、アイコン（SVG）の中
      if (!(target instanceof HTMLElement || target instanceof SVGElement)) return;
      const edges = pullableEdges(target, root);
      if (edges.length === 0) return;
      const origin = { x: touch.clientX, y: touch.clientY };
      /** 引いている端。決まるまでは縦横どちらの、どちら向きのなぞりか分からない */
      let pulling: PullEdge | null = null;
      let pulled = 0;

      const move = (event: TouchEvent) => {
        const touch = event.touches[0];
        if (event.touches.length !== 1 || !touch || event.defaultPrevented) {
          cancel();
          return;
        }
        const dx = touch.clientX - origin.x;
        const dy = touch.clientY - origin.y;
        if (!pulling) {
          if (Math.hypot(dx, dy) < DIRECTION_SLOP) return;
          // 下へ動かせば上端から、上へ動かせば下端から引いている。引けない端へのなぞり（ページのスクロール）と
          // 横のなぞり（スワイプ）は引いたことにしない
          const toward: PullEdge = dy > 0 ? 'top' : 'bottom';
          if (Math.abs(dy) <= Math.abs(dx) || !edges.includes(toward)) {
            cancel();
            return;
          }
          pulling = toward;
          setEdge(toward);
        }
        pulled = Math.max(pulling === 'top' ? dy : -dy, 0);
        setDistance(pulled);
      };

      const end = () => {
        cancel();
        if (pulled < PULL_THRESHOLD) return;
        setRefreshing(true);
        queryClient
          .refetchQueries({ type: 'active' }, { throwOnError: true })
          .catch((error: unknown) => {
            // 取り直しの途中で別の取得に置き換えられた（画面を移った、など）のは失敗ではない
            if (!isCancelledError(error)) notify('error', '更新できませんでした', FAILED_NOTICE_MS);
          })
          .finally(() => setRefreshing(false));
      };

      // 続きは指を下ろした要素で受ける。タッチのイベントはその要素に届き続けるが、描き直し
      // （骨組みが中身に替わる、取り直した一覧を描き直す）でその要素が DOM から外れると、
      // document には届かなくなる
      gesture = new AbortController();
      const options = {
        passive: true,
        signal: AbortSignal.any([controller.signal, gesture.signal]),
      };
      // HTML と SVG の要素の共通の型（タッチのイベントの型を知っている）で受ける
      const touched: GlobalEventHandlers = target;
      touched.addEventListener('touchmove', move, options);
      touched.addEventListener('touchend', end, options);
      touched.addEventListener('touchcancel', cancel, options);
    };

    root.addEventListener('touchstart', start, { passive: true, signal: controller.signal });

    return () => {
      controller.abort();
      setDistance(null);
    };
  }, [area, enabled, refreshing, queryClient]);

  return {
    /** 引いている（取り直している）端。引いたことが無ければ上端 */
    edge,
    /** 引いた距離（px）。引いていない間は null */
    distance,
    /** 引き切って離し、取り直している最中か。オフラインになって取得が保留されている間は含めない */
    refreshing: refreshing && online,
  };
}
