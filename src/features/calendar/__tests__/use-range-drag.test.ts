import { act, createElement, type PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS, LONG_PRESS_SLOP } from '../../../lib/ui/use-record-press.ts';
import type { Drag } from '../range-drag-session.ts';
import { useRangeDrag } from '../use-range-drag.ts';

// React の act を使う（テスト用の描画ライブラリは入れていない）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** グリッドの 1 点は x 座標そのもの、つまむ物は文字列、範囲は「押した所→今の所」の文字列で表す */
type Options = Partial<Parameters<typeof useRangeDrag<number, string, string>>[0]>;

const rangeOf = ({ grab, from, to, moved }: Drag<number, string>) =>
  `${grab ?? '-'}:${from}->${to}${moved ? '*' : ''}`;

let unmount: () => void = () => {};

/** フックを 1 度だけ描いて、返したハンドラを受け取る（ドラッグの状態は描画をまたぐ `RangeDragSession` が持つので描き直さなくてよい） */
function setup(options: Options = {}) {
  const onChange = vi.fn();
  let handlers!: ReturnType<typeof useRangeDrag<number, string, string>>;
  function Probe() {
    handlers = useRangeDrag<number, string, string>({
      locate: (event) => event.clientX,
      rangeOf,
      onChange,
      ...options,
    });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Probe)));
  unmount = () => act(() => root.unmount());
  return { handlers, onChange };
}

const element = Object.assign(document.createElement('div'), { setPointerCapture: vi.fn() });

/** React のポインタイベントの代わり。フックが読むものだけを持つ */
function pointer(
  x: number,
  {
    y = 0,
    pointerId = 1,
    pointerType = 'mouse',
  }: { y?: number; pointerId?: number; pointerType?: string } = {},
) {
  return {
    button: 0,
    pointerId,
    pointerType,
    clientX: x,
    clientY: y,
    target: element,
    currentTarget: element,
    stopPropagation: () => {},
  } as unknown as PointerEvent<HTMLElement>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

describe('useRangeDrag', () => {
  it('マウスは押した時点から選び、なぞった所まで広げて、離したら締めくくる', () => {
    const { handlers, onChange } = setup();
    handlers.props.onPointerDown(pointer(10));
    handlers.props.onPointerMove(pointer(40));
    handlers.props.onPointerUp(pointer(50));
    expect(onChange.mock.calls).toEqual([
      ['-:10->10', false],
      ['-:10->40*', false],
      ['-:10->50*', true],
    ]);
  });

  it('タッチは長押しを待ってから始める', () => {
    const { handlers, onChange } = setup();
    handlers.props.onPointerDown(pointer(10, { pointerType: 'touch' }));
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onChange.mock.calls).toEqual([['-:10->10', false]]);
  });

  it('長押しを待つ間に動いたらスクロールとみなしてやめる', () => {
    const { handlers, onChange } = setup();
    handlers.props.onPointerDown(pointer(10, { pointerType: 'touch' }));
    handlers.props.onPointerMove(pointer(10 + LONG_PRESS_SLOP + 1, { pointerType: 'touch' }));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    handlers.props.onPointerUp(pointer(10, { pointerType: 'touch' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('タッチの軽いタップは onTouchTap に渡し、範囲は選ばない', () => {
    const onTouchTap = vi.fn();
    const { handlers, onChange } = setup({ onTouchTap });
    handlers.props.onPointerDown(pointer(10, { pointerType: 'touch' }));
    handlers.props.onPointerUp(pointer(10, { pointerType: 'touch' }));
    expect(onTouchTap).toHaveBeenCalledWith(10);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('onTouchTap が無ければ、タッチの軽いタップは押した所を範囲にする', () => {
    const { handlers, onChange } = setup();
    handlers.props.onPointerDown(pointer(10, { pointerType: 'touch' }));
    handlers.props.onPointerUp(pointer(10, { pointerType: 'touch' }));
    expect(onChange.mock.calls).toEqual([['-:10->10', true]]);
  });

  it('タップを譲るつまみ方でも、タッチの長押しが決まった時点で知らせる（編集モードに入る）', () => {
    const { handlers, onChange } = setup();
    const grab = handlers.grabProps('item', { tap: false });
    grab.onPointerDown(pointer(10, { pointerType: 'touch' }));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    grab.onPointerUp(pointer(10, { pointerType: 'touch' }));
    expect(onChange.mock.calls).toEqual([
      ['item:10->10', false],
      ['item:10->10', true],
    ]);
  });

  it('タップを譲るつまみ方は、動かさずに離せば何も知らせない（項目の click に任せる）', () => {
    const { handlers, onChange } = setup();
    const grab = handlers.grabProps('item', { tap: false });
    grab.onPointerDown(pointer(10));
    grab.onPointerUp(pointer(10));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('タップを譲るつまみ方でも、動かせば範囲を知らせる', () => {
    const { handlers, onChange } = setup();
    const grab = handlers.grabProps('item', { tap: false });
    grab.onPointerDown(pointer(10));
    // 指のぶれの内側ではまだクリックかもしれないので知らせない
    grab.onPointerMove(pointer(10 + LONG_PRESS_SLOP));
    grab.onPointerMove(pointer(40));
    grab.onPointerUp(pointer(40));
    expect(onChange.mock.calls).toEqual([
      ['item:10->40*', false],
      ['item:10->40*', true],
    ]);
  });

  it('範囲が変わったときだけ震わせる（最初の 1 回は比べる相手が無いので震わせない）', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { handlers } = setup({ vibration: (previous, next) => (previous === next ? null : 10) });
    handlers.props.onPointerDown(pointer(10));
    handlers.props.onPointerMove(pointer(40));
    handlers.props.onPointerMove(pointer(40));
    expect(vibrate.mock.calls).toEqual([[10]]);
  });

  it('別の指が触れたらそのドラッグは終わる', () => {
    const { handlers, onChange } = setup();
    handlers.props.onPointerDown(pointer(10));
    act(() => {
      document.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 2 }));
    });
    handlers.props.onPointerMove(pointer(40));
    handlers.props.onPointerUp(pointer(40));
    expect(onChange.mock.calls).toEqual([['-:10->10', false]]);
  });
});
