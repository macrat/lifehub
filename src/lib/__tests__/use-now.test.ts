import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { today } from '../../../shared/date.ts';
import { useClock } from '../use-now.ts';
import { renderHook } from './render-hook.ts';

describe('useClock', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-09-23T23:58:30+09:00') }));
  afterEach(() => vi.useRealTimers());

  it('導いた値が変わったときだけ新しい値になる（日付は日をまたいだときだけ）', () => {
    let renders = 0;
    const { read } = renderHook(() => {
      renders += 1;
      return useClock(today);
    });
    expect(read()).toBe('2026-09-23');

    act(() => vi.advanceTimersByTime(60_000));
    expect(read()).toBe('2026-09-23');
    expect(renders).toBe(1);

    act(() => vi.advanceTimersByTime(60_000));
    expect(read()).toBe('2026-09-24');
    expect(renders).toBe(2);
  });

  it('比べ方を渡すと、同じとみなした間は前の値のまま', () => {
    const { read } = renderHook(() =>
      useClock(
        (now) => ({ day: today(now) }),
        (a, b) => a.day === b.day,
      ),
    );
    const first = read();
    act(() => vi.advanceTimersByTime(60_000));
    expect(read()).toBe(first);
  });
});
