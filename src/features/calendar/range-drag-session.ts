import type { PointerEvent } from 'react';
import { movedPastSlop } from '../../lib/ui/tap-slop.ts';
import { blockTouchMove } from '../../lib/ui/touch-block.ts';
// 長押しの区切りはアプリで 1 つ（一覧の行も同じ長さで編集に入る。`use-record-press.ts`）
import { LONG_PRESS_MS } from '../../lib/ui/use-record-press.ts';

/** ドラッグの今の姿。from は押した所、to は今の所（同じなら動いていない） */
export type Drag<P, G> = {
  /** つまんだ物（空いている所を押しただけなら null） */
  grab: G | null;
  from: P;
  to: P;
  /** ドラッグしたか（タップ・クリックと、つまんだだけで動かしていないときは false） */
  moved: boolean;
};

/** つまみ方。何をつまんだかによって、始め方とタップの意味が変わる */
export type GrabOptions = {
  /** 長押しを待たずに始めるか（端の丸・枠のような、そこを押す以外の使い道が無い所） */
  instant?: boolean;
  /**
   * 動かさずに離したときも範囲を選ぶか。false は「タップ・クリックは押した要素に譲る」
   * （保存済みの予定をつまむときの、詳細を開くタップ）。
   */
  tap?: boolean;
};

/** ドラッグの姿をどう読み、どこへ知らせるか。呼び出し側（`useRangeDrag`）が描画ごとに渡す */
export type RangeCallbacks<P, G, R> = {
  /** ポインタの位置 → グリッドの 1 点。掴めない所なら null */
  locate: (event: PointerEvent<HTMLElement>) => P | null;
  /** ドラッグの姿 → 範囲 */
  rangeOf: (drag: Drag<P, G>) => R;
  /** 範囲が決まるたび。done はポインタを離した（入力に移ってよい）か */
  onChange: (range: R, done: boolean) => void;
  /** 範囲が変わったときの手応えの長さ（ms）。震わせないなら null。何が区切りかは呼び出し側が決める */
  vibration?: (previous: R, next: R) => number | null;
  /** タッチの軽いタップ。省略するとタップでも範囲を選ぶ */
  onTouchTap?: (point: P) => void;
};

/**
 * ドラッグ 1 回の段階。進むのは waiting → holding → emitting の向きだけで、どれも飛ばせる
 * （マウスは holding から、タップにも意味があれば押した時点で emitting から始まる）。
 */
type Phase<R> =
  /** タッチの長押しを待っている（まだ始まっていない。動いたらスクロールとみなしてやめる） */
  | { kind: 'waiting' }
  /** 始まったが、まだ何も知らせていない（マウスで予定をつまんだ直後。クリックかもしれない） */
  | { kind: 'holding' }
  /** 範囲を知らせている。range は直前に渡した範囲で、手応えのために 1 つ前と比べる */
  | { kind: 'emitting'; range: R };

/** ドラッグ 1 回の間だけ持つ値。範囲（`Drag`）に、追いかけるのに要るものを足したもの */
type DragState<P, G, R> = Drag<P, G> & {
  pointerId: number;
  origin: { x: number; y: number };
  /** 動かさずに離したときも選ぶか（`GrabOptions.tap`） */
  tap: boolean;
  phase: Phase<R>;
};

/**
 * 1 本の指で範囲をなぞる仕掛けの本体。React から切り離した状態機械で、ドラッグ 1 回の値と
 * その間だけ借りるもの（長押しの待ち、ポインタの捕獲、タッチの取り上げ）の持ち主になる。
 * 描画のたびに変わる読み方・知らせ先（`RangeCallbacks`）は持たず、呼ぶたびに受け取る。
 * 長押しの待ちの後は、押したときに受け取ったものを使う。
 */
export class RangeDragSession<P, G, R> {
  #drag: DragState<P, G, R> | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  /** なぞっている間タッチを取り上げている後始末（`blockTouchMove`）。掴んでいないときは null */
  #block: AbortController | null = null;

  /** 今のドラッグを捨てる。長押しの待ちとタッチの取り上げも残さない */
  stop() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#block?.abort();
    this.#block = null;
    this.#drag = null;
  }

  /** どこかで指が触れたとき。今のドラッグと別の指なら、そのドラッグは終わり（ピンチに譲る） */
  touch(pointerId: number) {
    if (this.#drag && pointerId !== this.#drag.pointerId) this.stop();
  }

  start(
    event: PointerEvent<HTMLElement>,
    grab: G | null,
    from: P,
    { instant = false, tap = true }: GrabOptions,
    cb: RangeCallbacks<P, G, R>,
  ) {
    // 2 本目の指なら、今のドラッグごとやめて新しくは始めない（ピンチに譲る）
    if (this.#drag) return this.stop();
    this.#drag = {
      pointerId: event.pointerId,
      grab,
      from,
      to: from,
      origin: { x: event.clientX, y: event.clientY },
      moved: false,
      tap,
      phase: { kind: 'waiting' },
    };
    const element = event.currentTarget;
    const longPress = event.pointerType === 'touch' && !instant;
    if (longPress) this.#timer = setTimeout(() => this.#begin(element, true, cb), LONG_PRESS_MS);
    else this.#begin(element, false, cb);
  }

  move(event: PointerEvent<HTMLElement>, cb: RangeCallbacks<P, G, R>) {
    const d = this.#drag;
    if (!d || d.pointerId !== event.pointerId) return;
    const far = movedPastSlop(d.origin, event);
    if (d.phase.kind === 'waiting') {
      // 長押しを待つ間に動いたらスクロールのつもりとみなしてやめる
      if (far) this.stop();
      return;
    }
    if (far) d.moved = true;
    // まだ何も知らせていない（クリックかもしれない）うちは、動いたとはっきりするまで待つ
    if (d.phase.kind === 'holding' && !d.moved) return;
    const to = cb.locate(event);
    if (to === null) return;
    d.to = to;
    this.#emit(d, false, cb);
  }

  up(event: PointerEvent<HTMLElement>, cb: RangeCallbacks<P, G, R>) {
    const d = this.#drag;
    if (!d || d.pointerId !== event.pointerId) return;
    switch (d.phase.kind) {
      case 'emitting':
        // 知らせたドラッグだけを締めくくる
        d.to = cb.locate(event) ?? d.to;
        this.#emit(d, true, cb);
        break;
      case 'holding':
        // クリックに終わった（項目の click に任せる）ので何も起こさない
        break;
      case 'waiting':
        // タッチの軽いタップ。日を選ぶ所（月表示のセル）ならそちらへ、それ以外は押した所を範囲にする。
        // タップを譲る約束（tap: false）で掴んだ物は何もしない（項目の click が詳細を開く）
        if (!d.tap) break;
        if (cb.onTouchTap) cb.onTouchTap(d.from);
        else this.#emit(d, true, cb);
        break;
    }
    this.stop();
  }

  /** 長押しが決まった、または待たずに始めるとき。ここから指をこのドラッグだけに使う */
  #begin(element: HTMLElement, longPress: boolean, cb: RangeCallbacks<P, G, R>) {
    const d = this.#drag;
    if (!d) return;
    d.phase = { kind: 'holding' };
    // グリッドの外に出ても離すまで追いかける（隣の列や画面の外で見失わない）
    element.setPointerCapture(d.pointerId);
    // ここからのタッチは選択にだけ使う（縦スクロールと横スワイプに渡さない）。
    // 掴んだその場で取り上げる。描画を挟むと、その 1 枚ぶんだけ画面が流れてしまう
    this.#block = new AbortController();
    blockTouchMove(this.#block.signal);
    // 押しただけで知らせるのは、タップにも意味があるときか、長押しが決まったとき。
    // どちらでもない（マウスで予定をつまんだ）ときはまだクリックかもしれないので、動くまで待つ
    if (d.tap || longPress) this.#emit(d, false, cb);
  }

  /**
   * 範囲を呼び出し側に渡す。1 つ前の範囲から変わっていれば、その長さだけ震わせる。
   * ドラッグの最初の 1 回は比べる相手が無いので震わせない（押しただけで手応えを返さない）。
   */
  #emit(d: DragState<P, G, R>, done: boolean, cb: RangeCallbacks<P, G, R>) {
    const range = cb.rangeOf(d);
    const ms = d.phase.kind === 'emitting' ? cb.vibration?.(d.phase.range, range) : null;
    // Vibration API の無いブラウザ（iOS）では何も起こらない
    if (ms) navigator.vibrate?.(ms);
    d.phase = { kind: 'emitting', range };
    cb.onChange(range, done);
  }
}
