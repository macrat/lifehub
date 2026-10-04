import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimeout } from '../ui/use-timeout.ts';
import { renderHook } from './render-hook.ts';

function setup() {
  const { read, unmount } = renderHook(useTimeout);
  return { later: read(), unmount };
}

describe('useTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('時間が来たら呼ぶ', () => {
    const { later } = setup();
    const callback = vi.fn();
    later(callback, 100);
    vi.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
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
    const { later } = setup();
    const first = vi.fn();
    const second = vi.fn();
    later(first, 100);
    later(second, 100);
    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
