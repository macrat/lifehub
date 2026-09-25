import { useMatches } from '@tanstack/react-router';
import { type RefObject, useEffect, useState } from 'react';

/** 離したときに再読み込みする、指を下ろした所からの下向きの動き（px） */
export const PULL_THRESHOLD = 80;

/** 向きを決めるまでの動き（px）。これに満たない間はタップかもしれないので何もしない */
const DIRECTION_SLOP = 8;

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /**
     * この画面では引っ張って更新をしない。その意味が無いうえに操作を壊す画面だけに付ける
     * （上端に指で動かす操作が並ぶ、入力の途中でシートが開いている、など）。
     * 下向きの動きが再読み込みに化けるとやりかけが消える。
     */
    noPullToRefresh?: boolean;
  }
}

/**
 * 縦のなぞりをブラウザに任せている要素か（`touch-action` が下向きの移動を許している）。
 * 許していない所（シートや予定のつまみなど、なぞりを自分で扱う所）ではブラウザもページを動かさず、
 * ブラウザの引っ張って更新も起きない。同じ宣言を読んで、それに揃える
 */
function pansDown(el: Element): boolean {
  const touchAction = getComputedStyle(el).touchAction;
  return (
    touchAction === 'auto' || touchAction === 'manipulation' || /pan-(y|down)/.test(touchAction)
  );
}

/**
 * ページ全体を下へ引いてよい押し方か。ブラウザの引っ張って更新と同じく、
 * ページの一番上で、指の下に途中までスクロールした所が無く（カレンダーの時間軸などを上へ戻している
 * 最中に再読み込みに化けない）、縦のなぞりを自分で扱う所でもないときだけ引ける。
 */
function canStartPull(
  target: EventTarget | null,
  area: HTMLElement,
): target is HTMLElement | SVGElement {
  // 指の下は HTML の要素か、アイコン（SVG）の中
  if (!(target instanceof HTMLElement || target instanceof SVGElement)) return false;
  if (window.scrollY > 0) return false;
  for (let el: Element | null = target; el && el !== area; el = el.parentElement) {
    if (el.scrollTop > 0 || !pansDown(el)) return false;
  }
  return true;
}

/**
 * 引っ張って更新（ブラウザのものを止めて代わりに持つ理由は `PullToRefresh`）。
 * 画面が `staticData.noPullToRefresh` で断っている間は何もしない。
 *
 * `area` は引ける範囲（アプリの枠）。指を下ろしたことはここで受けるので、body に出るダイアログや
 * 段を持たないシートの上の操作は届かない。
 * 枠の中に出る 2 段のシート（カレンダーのクイック入力）は、なぞりを自分で扱う（`touch-action: none`）ので
 * `canStartPull` が外す。どちらも、シートを下へなぞって閉じる操作が再読み込みに化けない。
 *
 * タッチは見るだけで取り上げない（passive）。ページのスクロールはブラウザの速い経路のままで、
 * ここは印を出すための距離を数えるだけ。
 * 誰かが先に取り上げたなぞり（`blockTouchMove`。予定をつまんで動かすなど）と、
 * 2 本指（カレンダーのつまむ操作）は引いたことにしない。
 *
 * 離したときはブラウザの引っ張って更新と同じく、ページを読み込み直す。
 */
export function usePullToRefresh(area: RefObject<HTMLElement | null>) {
  const enabled = useMatches({
    select: (matches) => !matches.some((match) => match.staticData.noPullToRefresh),
  });
  /** 下へ引いた距離。引いていない間は null */
  const [distance, setDistance] = useState<number | null>(null);
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
      if (!canStartPull(target, root)) return;
      const origin = { x: touch.clientX, y: touch.clientY };
      /** 下へ引いていると決まったか。決まるまでは縦横どちらのなぞりか分からない */
      let pulling = false;
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
          // 上へのなぞり（ページのスクロール）と横のなぞり（スワイプ）は引いたことにしない
          if (dy <= Math.abs(dx)) {
            cancel();
            return;
          }
          pulling = true;
        }
        pulled = Math.max(dy, 0);
        setDistance(pulled);
      };

      const end = () => {
        if (pulled >= PULL_THRESHOLD) {
          setRefreshing(true);
          location.reload();
        }
        cancel();
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
  }, [area, enabled, refreshing]);

  return {
    /** 下へ引いた距離（px）。引いていない間は null */
    distance,
    /** 引き切って離し、読み込み直している最中か */
    refreshing,
  };
}
