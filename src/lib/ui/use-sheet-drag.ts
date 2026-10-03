import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { clamp } from '../math.ts';

/**
 * 追従を始めるまでの動き（px）。これに満たない間はシートを動かさないので、
 * 入力欄やボタンの上から始めても、タップはそのまま中身に届く。
 */
const DRAG_SLOP = 8;

/** 指を下ろしてから離すまで。動かし始める（follow が付く）までは中身の操作に任せる */
type Press = {
  pointerId: number;
  /** 指を下ろした位置 */
  x: number;
  y: number;
  /** 指の下にある、自分でスクロールする所（シートより先に動かす） */
  scroller: HTMLElement | null;
  follow: {
    /** 前回の指の位置 */
    last: number;
    /** 今のシートの位置 */
    at: number;
    /** シートに渡した動きの合計（スクロールに使った分は含まない）。段を決めるのに使う */
    moved: number;
  } | null;
};

type Options = {
  /** 動かせるか。止まる位置が決まる（中身を測れる）までは動かさない */
  enabled: boolean;
  /** 止まっている位置（translateY の px）。動かし始めるときの起点 */
  resting: number;
  /** 動かせる下端（translateY の px）。上端は 0（上の段） */
  max: number;
  /** 動かしてから離したとき。シートに渡した動きの合計（下向きが正）を受け取り、次の段を決める */
  onRelease: (moved: number) => void;
};

/** 指の下にある、シートの中で自分でスクロールする所。無ければ null */
function scrollerAt(target: Element, sheet: Element): HTMLElement | null {
  for (let el: Element | null = target; el && el !== sheet; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return el;
  }
  return null;
}

/** その向きへまだスクロールできるか（下へなぞる = 中身を下ろす = scrollTop を減らす） */
function scrolls(el: HTMLElement, dy: number): boolean {
  return dy > 0 ? el.scrollTop > 0 : el.scrollTop < el.scrollHeight - el.clientHeight;
}

/**
 * 押した指が追従を始めるか。斜め・横の動き（文字の選択など）では始めず、
 * 縦にはっきり動いたときだけ追従する
 */
function startsFollowing(press: Press, event: PointerEvent<HTMLElement>): boolean {
  const dy = event.clientY - press.y;
  return Math.abs(dy) >= DRAG_SLOP && Math.abs(dy) > Math.abs(event.clientX - press.x);
}

/**
 * シートを指で縦に動かす仕掛け。どこで止めるか（段）は知らず、指に追従させて、
 * 離したら動いた量を `onRelease` に渡すだけ。止まる位置は呼び出し側が `resting` で返す。
 *
 * ドラッグは中身のどこからでも始められる（入力欄やボタンの上も含む。つまむ帯だけでは狭すぎる）。
 * 縦に `DRAG_SLOP` 動かすまではシートを動かさないので、タップや文字の選択は中身に届く。
 * 中身のスクロールもここで面倒を見る: 指の下がまだスクロールできるならそちらを先に動かし、
 * 端まで行ってからシートが動く。ブラウザに任せる（`touch-action: pan-y`）と、スクロールできない
 * 所でもブラウザがなぞりを取り上げて pointercancel を送るため、シートを動かせなくなる。
 *
 * 押している指（`Press`）は ref に持ち、描くのに要るシートの位置だけを state にする。
 * pointermove は連続するイベントなので React は 1 回ごとには描き直さず、state に持つと
 * 同じフレームに来た 2 回目以降が古い値を読んで、その間の動きを落とす（遅い端末や速いなぞりで、
 * 指を `STEP_DISTANCE` 以上動かしても段が変わらない）。
 */
export function useSheetDrag({ enabled, resting, max, onRelease }: Options) {
  const press = useRef<Press | null>(null);
  /** 指に追従している間のシートの位置。追従していなければ null */
  const [following, setFollowing] = useState<number | null>(null);
  /** 離した瞬間の位置。1 フレームだけ保ってから段へ滑らせる（同じ更新で transition を戻すと効かない） */
  const [released, setReleased] = useState<number | null>(null);

  useEffect(() => {
    if (released === null) return;
    const frame = requestAnimationFrame(() => setReleased(null));
    return () => cancelAnimationFrame(frame);
  }, [released]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !enabled) return;
    if (!(event.target instanceof Element)) return;
    // メニューや入れ子のダイアログは body に出るが、React のツリーの上ではシートの中にある。
    // それらの上の操作をドラッグにすると指を離す先を奪ってしまうので、DOM で中身かを確かめる
    if (!event.currentTarget.contains(event.target)) return;
    // ここではまだ捕まえない。動かさずに離せばタップとして中身に届く
    press.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scroller: scrollerAt(event.target, event.currentTarget),
      follow: null,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = press.current;
    if (current?.pointerId !== event.pointerId) return;
    const follow = current.follow;
    if (!follow) {
      if (!startsFollowing(current, event)) return;
      // ここで捕まえると、この指の click は中身ではなくシートに向くので、押したことにはならない
      event.currentTarget.setPointerCapture(event.pointerId);
      current.follow = { last: event.clientY, at: resting, moved: 0 };
      setFollowing(resting);
      return;
    }
    const dy = event.clientY - follow.last;
    follow.last = event.clientY;
    // 指の下がまだスクロールできるなら、シートより先にそちらを動かす
    if (current.scroller && scrolls(current.scroller, dy)) {
      current.scroller.scrollTop -= dy;
      return;
    }
    follow.at = clamp(follow.at + dy, 0, max);
    follow.moved += dy;
    setFollowing(follow.at);
  };

  /** 指を離したとき。動かしていなければ（タップなら）何もせず、中身に任せたままにする */
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const current = press.current;
    if (current?.pointerId !== event.pointerId) return;
    press.current = null;
    if (!current.follow) return;
    setFollowing(null);
    setReleased(current.follow.at);
    onRelease(current.follow.moved);
  };

  /** ブラウザがスクロールを始めたときなど。段は変えず、今の段へ戻す */
  const onPointerCancel = (event: PointerEvent<HTMLElement>) => {
    const current = press.current;
    if (current?.pointerId !== event.pointerId) return;
    press.current = null;
    if (!current.follow) return;
    setFollowing(null);
    setReleased(current.follow.at);
  };

  return {
    /**
     * 今のシートの位置（translateY の px）。指で動かしている間は指に、離した後は `resting` に従う。
     * 動かせない（止まる位置が決まっていない）間は null
     */
    position: enabled ? (following ?? released ?? resting) : null,
    /** 指に追従している最中か（その間は transition を切る） */
    dragging: following !== null,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
