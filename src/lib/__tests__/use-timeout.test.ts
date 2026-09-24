import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimeout } from '../ui/use-timeout.ts';

// React の act を使う（テスト用の描画ライブラリは入れていない）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setup() {
  let later!: ReturnType<typeof useTimeout>;
  function Probe() {
    later = useTimeout();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Probe)));
  return { later, unmount: () => act(() => root.unmount()) };
}

describe('useTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('時間が来たら呼ぶ', () => {
    const { later, unmount } = setup();
    const callback = vi.fn();
    later(callback, 100);
    vi.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
    unmount();
  });

  it('消えた部品の予約は呼ばない（遅れて届いた閉じる処理が、次に開いたものを閉じない）', () => {
    const { later, unmount } = setup();
    const callback = vi.fn();
    later(callback, 100);
    unmount();
    vi.advanceTimersByTime(100);
    expect(callback).not.toHaveBeenCalled();
  });

  it('予約し直すと前の予約は呼ばない', () => {
    const { later, unmount } = setup();
    const first = vi.fn();
    const second = vi.fn();
    later(first, 100);
    later(second, 100);
    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    unmount();
  });
});
