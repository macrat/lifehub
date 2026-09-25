import { useEffect, useEffectEvent } from 'react';

/**
 * 今いる画面のタブをもう一度押したことを画面の一覧に知らせるイベント。
 * ナビ（`AppShell`）は画面の中身を知らず、一覧はナビを知らないので、間を DOM のイベントで繋ぐ
 */
const EVENT = 'lifehub:scroll-to-initial';

/**
 * 今の画面の最初の位置までなめらかにスクロールする。位置を決める一覧（`useInitialPosition`）が
 * 受け取らなければ、最初の位置は一番上
 */
export function scrollToInitialPosition() {
  // 取り消されていない＝受け取った一覧が無い
  if (window.dispatchEvent(new Event(EVENT, { cancelable: true }))) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/** 最初の位置が一番上ではない一覧が、そこまでなめらかにスクロールする方法を受け持つ */
export function useInitialPosition(scroll: () => void) {
  const onEvent = useEffectEvent((event: Event) => {
    event.preventDefault();
    scroll();
  });
  useEffect(() => {
    const listener = (event: Event) => onEvent(event);
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, []);
}
