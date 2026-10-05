import { useEffect, useEffectEvent, useState } from 'react';

/** 時計を見直す間隔の既定（ms） */
const CLOCK_INTERVAL_MS = 60_000;

/**
 * 時計から導いた値。一定間隔で時計を見直し、導いた値が変わったときだけ描き直す。
 * 日付や「今日・明日」のように変わることの少ない値は、導いて比べることで 1 日に数回しか描き直さない。
 * `derive` と `isEqual` は毎描画で作り直してよい（見直すときに最新の物を呼ぶ）。
 */
export function useClock<T>(
  derive: (now: Date) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
  intervalMs = CLOCK_INTERVAL_MS,
): T {
  const [value, setValue] = useState(() => derive(new Date()));
  const tick = useEffectEvent(() => {
    const next = derive(new Date());
    setValue((prev) => (isEqual(prev, next) ? prev : next));
  });
  useEffect(() => {
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return value;
}

/** 現在時刻。一定間隔で更新する（現在時刻の線など、時計に追従したい表示に使う） */
export function useNow(intervalMs = CLOCK_INTERVAL_MS): Date {
  return useClock((now) => now, Object.is, intervalMs);
}
